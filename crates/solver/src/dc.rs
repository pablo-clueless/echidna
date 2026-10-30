use std::collections::{BTreeMap, HashMap};

use crate::circuit::{Circuit, DcSolution, Element, ElementKind, SolveError, THERMAL_VOLTAGE};
use crate::devices::{
    bjt, critical_voltage, junction, limit_drain_source, limit_fet, limit_junction, mosfet,
};
use crate::matrix::System;

const MAX_ITERATIONS: usize = 150;
const RELTOL: f64 = 1e-6;
const VNTOL: f64 = 1e-9;
const ABSTOL: f64 = 1e-15;
/// Conductance from every node to ground, so a half-wired schematic still solves instead of going singular.
const GSHUNT: f64 = 1e-12;

/// Smallest input voltage a regulator's quiescent current is scaled against while it is off, so a regulator with
/// no dropout still has a finite resistance to its input.
const REGULATOR_OFF_SCALE: f64 = 0.1;

type Node = Option<usize>;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum RegulatorMode {
    /// Output held at the set voltage.
    Regulating,
    /// Input too low to regulate: output follows it, a dropout voltage below.
    Dropout,
    /// Input no higher than the dropout voltage: the pass element is off, so the output is disconnected, and the
    /// bias circuit draws in proportion to the input rather than its full quiescent current.
    Off,
}

impl RegulatorMode {
    fn of(headroom: f64, output_voltage: f64) -> Self {
        if headroom <= 0.0 {
            Self::Off
        } else if headroom < output_voltage {
            Self::Dropout
        } else {
            Self::Regulating
        }
    }

    /// One mode closer to `target`. Stepping through dropout, rather than jumping between regulating and off, stops
    /// Newton–Raphson cycling when a heavy load browns out the input: regulating drags the input below dropout, off
    /// lets it recover, and only dropout is consistent.
    fn toward(self, target: Self) -> Self {
        match (self, target) {
            (Self::Regulating, Self::Off) | (Self::Off, Self::Regulating) => Self::Dropout,
            _ => target,
        }
    }
}

/// Conductance from input to ground that stands in for the quiescent current while a regulator is off. It draws the
/// full quiescent current with the input at the dropout voltage, where the regulator turns on, so the two meet.
fn regulator_off_conductance(quiescent_current: f64, dropout_voltage: f64) -> f64 {
    quiescent_current / dropout_voltage.max(REGULATOR_OFF_SCALE)
}

struct Prepared<'a> {
    element: &'a Element,
    pins: Vec<Node>,
    internal: Node,
    branch: usize,
}

/// Linear stand-in for a capacitor or inductor over one time step, from the integration formula. A capacitor
/// passes `gain·v + offset` from its first pin to its second; an inductor holds `v = gain·i + offset` across itself.
/// The default, all zero, is the DC case: capacitors open and inductors shorted.
#[derive(Clone, Copy, Default)]
pub(crate) struct Companion {
    pub gain: f64,
    pub offset: f64,
}

#[derive(Clone, Copy)]
pub(crate) enum State {
    None,
    Junction {
        vd: f64,
    },
    Regulator {
        mode: RegulatorMode,
    },
    /// Junction voltages with the polarity folded in, so they read as for an NPN.
    Bjt {
        vbe: f64,
        vbc: f64,
    },
    /// Gate–source and drain–source voltages with the polarity folded in, so they read as for an n-channel part.
    Mosfet {
        vgs: f64,
        vds: f64,
    },
}

/// Finds the DC operating point with Newton–Raphson iteration over a Modified Nodal Analysis system.
/// Capacitors are open and inductors are shorts. Diode junction voltages are limited between iterations
/// (SPICE `pnjlim`) so exponential models converge from a cold start.
pub fn solve_dc(circuit: &Circuit) -> Result<DcSolution, SolveError> {
    let network = Network::new(circuit)?;
    let companions = vec![Companion::default(); circuit.elements.len()];
    let mut states = network.initial_states();
    let mut x = network.unknowns();
    let iterations = network.newton(&mut x, &mut states, &companions)?;
    Ok(network.report(&x, &companions, iterations))
}

/// A validated circuit numbered into MNA unknowns: external nodes, then internal nodes, then branch currents.
pub(crate) struct Network<'a> {
    circuit: &'a Circuit,
    names: Vec<&'a str>,
    prepared: Vec<Prepared<'a>>,
    external: usize,
    first_branch: usize,
    size: usize,
}

impl<'a> Network<'a> {
    pub(crate) fn new(circuit: &'a Circuit) -> Result<Self, SolveError> {
        let mut index: HashMap<&str, usize> = HashMap::new();
        let mut names: Vec<&str> = Vec::new();
        let mut prepared = Vec::with_capacity(circuit.elements.len());
        for element in &circuit.elements {
            validate(element)?;
            let pins: Vec<Node> = element
                .nodes
                .iter()
                .map(|name| {
                    (*name != circuit.ground).then(|| {
                        *index.entry(name.as_str()).or_insert_with(|| {
                            names.push(name.as_str());
                            names.len() - 1
                        })
                    })
                })
                .collect();
            prepared.push((element, pins));
        }

        let external = names.len();
        let mut next = external;
        let mut prepared: Vec<Prepared> = prepared
            .into_iter()
            .map(|(element, pins)| {
                let internal = (element.kind.internal_node_count() > 0).then(|| {
                    next += 1;
                    next - 1
                });
                Prepared {
                    element,
                    pins,
                    internal,
                    branch: usize::MAX,
                }
            })
            .collect();
        let first_branch = next;
        for p in &mut prepared {
            if p.element.kind.branch_count() > 0 {
                p.branch = next;
                next += 1;
            }
        }
        Ok(Self {
            circuit,
            names,
            prepared,
            external,
            first_branch,
            size: next,
        })
    }

    /// A zeroed vector of unknowns, the starting point for a cold solve.
    pub(crate) fn unknowns(&self) -> Vec<f64> {
        vec![0.0; self.size]
    }

    /// Starting guesses for the non-linear devices, near where they conduct.
    pub(crate) fn initial_states(&self) -> Vec<State> {
        self.prepared
            .iter()
            .map(|p| match p.element.kind {
                ElementKind::Diode {
                    saturation_current,
                    emission_coefficient,
                    ..
                } => State::Junction {
                    vd: critical_voltage(
                        saturation_current,
                        emission_coefficient * THERMAL_VOLTAGE,
                    ),
                },
                ElementKind::LinearRegulator { .. } => State::Regulator {
                    mode: RegulatorMode::Regulating,
                },
                ElementKind::Bjt {
                    saturation_current, ..
                } => State::Bjt {
                    vbe: critical_voltage(saturation_current, THERMAL_VOLTAGE),
                    vbc: 0.0,
                },
                ElementKind::Mosfet {
                    channel,
                    threshold_voltage,
                    ..
                } => State::Mosfet {
                    vgs: channel.sign() * threshold_voltage,
                    vds: 0.0,
                },
                _ => State::None,
            })
            .collect()
    }

    /// Iterates from `x` and `states` until both settle, leaving the solution in them, and returns the number of
    /// iterations taken.
    pub(crate) fn newton(
        &self,
        x: &mut Vec<f64>,
        states: &mut [State],
        companions: &[Companion],
    ) -> Result<usize, SolveError> {
        for iteration in 1..=MAX_ITERATIONS {
            let mut system = System::new(self.size);
            for row in 0..self.external {
                system.add(row, row, GSHUNT);
            }
            for ((p, state), companion) in self.prepared.iter().zip(&*states).zip(companions) {
                stamp(&mut system, p, *state, *companion);
            }
            let x_new = system.solve().ok_or(SolveError::Singular)?;

            let mut settled = iteration > 1;
            for (p, state) in self.prepared.iter().zip(states.iter_mut()) {
                settled &= update(p, state, &x_new);
            }
            settled &= x_new.iter().zip(&*x).enumerate().all(|(i, (new, old))| {
                let floor = if i < self.first_branch { VNTOL } else { ABSTOL };
                (new - old).abs() <= RELTOL * new.abs().max(old.abs()) + floor
            });
            *x = x_new;

            if settled {
                return Ok(iteration);
            }
        }
        Err(SolveError::NoConvergence {
            iterations: MAX_ITERATIONS,
        })
    }

    /// The quantity each element stores energy in: a capacitor's voltage or an inductor's current. Zero for
    /// everything else.
    pub(crate) fn stored(&self, x: &[f64]) -> Vec<f64> {
        let v = |n: Node| n.map_or(0.0, |i| x[i]);
        self.prepared
            .iter()
            .map(|p| match p.element.kind {
                ElementKind::Capacitor { .. } => v(p.pins[0]) - v(p.pins[1]),
                ElementKind::Inductor { .. } => x[p.branch],
                _ => 0.0,
            })
            .collect()
    }

    pub(crate) fn report(
        &self,
        x: &[f64],
        companions: &[Companion],
        iterations: usize,
    ) -> DcSolution {
        report(
            self.circuit,
            &self.names,
            &self.prepared,
            x,
            companions,
            iterations,
        )
    }
}

fn validate(element: &Element) -> Result<(), SolveError> {
    let expected = element.kind.pin_count();
    if element.nodes.len() != expected {
        return Err(SolveError::PinCount {
            element_id: element.id.clone(),
            expected,
            actual: element.nodes.len(),
        });
    }
    let invalid = |reason: &str| {
        Err(SolveError::InvalidValue {
            element_id: element.id.clone(),
            reason: reason.to_owned(),
        })
    };
    match element.kind {
        ElementKind::Resistor { resistance } if !(resistance.is_finite() && resistance > 0.0) => {
            invalid("resistance must be a positive number of ohms")
        }
        ElementKind::Switch {
            contact_resistance, ..
        } if !(contact_resistance.is_finite() && contact_resistance > 0.0) => {
            invalid("contact resistance must be a positive number of ohms")
        }
        ElementKind::Switch { closed, .. } if closed != 0.0 && closed != 1.0 => {
            invalid("switch position must be 1 (closed) or 0 (open)")
        }
        ElementKind::Capacitor { capacitance }
            if !(capacitance.is_finite() && capacitance >= 0.0) =>
        {
            invalid("capacitance must be zero or more farads")
        }
        ElementKind::Inductor { inductance } if !(inductance.is_finite() && inductance >= 0.0) => {
            invalid("inductance must be zero or more henries")
        }
        ElementKind::VoltageSource { voltage } if !voltage.is_finite() => {
            invalid("voltage must be finite")
        }
        ElementKind::CurrentSource { current } if !current.is_finite() => {
            invalid("current must be finite")
        }
        ElementKind::Diode {
            saturation_current,
            emission_coefficient,
            series_resistance,
        } if !(saturation_current > 0.0
            && saturation_current.is_finite()
            && emission_coefficient > 0.0
            && emission_coefficient.is_finite()
            && series_resistance >= 0.0
            && series_resistance.is_finite()) =>
        {
            invalid("diode parameters must be positive and finite")
        }
        ElementKind::LinearRegulator {
            output_voltage,
            dropout_voltage,
            quiescent_current,
        } if !(output_voltage.is_finite()
            && dropout_voltage >= 0.0
            && dropout_voltage.is_finite()
            && quiescent_current >= 0.0
            && quiescent_current.is_finite()) =>
        {
            invalid(
                "regulator parameters must be finite, with dropout and quiescent current at least zero",
            )
        }
        ElementKind::Bjt {
            saturation_current,
            forward_beta,
            reverse_beta,
            early_voltage,
            ..
        } if !(saturation_current > 0.0
            && saturation_current.is_finite()
            && forward_beta > 0.0
            && forward_beta.is_finite()
            && reverse_beta > 0.0
            && reverse_beta.is_finite()
            && early_voltage >= 0.0
            && early_voltage.is_finite()) =>
        {
            invalid(
                "transistor parameters must be positive and finite, with the Early voltage at least zero",
            )
        }
        ElementKind::Mosfet {
            threshold_voltage,
            transconductance,
            channel_length_modulation,
            ..
        } if !(threshold_voltage.is_finite()
            && transconductance > 0.0
            && transconductance.is_finite()
            && channel_length_modulation >= 0.0
            && channel_length_modulation.is_finite()) =>
        {
            invalid(
                "MOSFET parameters must be finite, with positive transconductance and channel-length modulation at least zero",
            )
        }
        _ => Ok(()),
    }
}

fn conductance(s: &mut System, g: f64, a: Node, b: Node) {
    if let Some(a) = a {
        s.add(a, a, g);
    }
    if let Some(b) = b {
        s.add(b, b, g);
    }
    if let (Some(a), Some(b)) = (a, b) {
        s.add(a, b, -g);
        s.add(b, a, -g);
    }
}

/// Current `i` flowing out of node `from`, through the element, into node `to`.
fn current(s: &mut System, i: f64, from: Node, to: Node) {
    if let Some(from) = from {
        s.add_rhs(from, -i);
    }
    if let Some(to) = to {
        s.add_rhs(to, i);
    }
}

/// Couples branch unknown `k` into KCL as a current leaving `p` and entering `n`.
fn branch_kcl(s: &mut System, k: usize, p: Node, n: Node) {
    if let Some(p) = p {
        s.add(p, k, 1.0);
    }
    if let Some(n) = n {
        s.add(n, k, -1.0);
    }
}

/// Branch equation `V(p) − V(n) = v`.
fn branch_voltage(s: &mut System, k: usize, p: Node, n: Node, v: f64) {
    if let Some(p) = p {
        s.add(k, p, 1.0);
    }
    if let Some(n) = n {
        s.add(k, n, -1.0);
    }
    s.add_rhs(k, v);
}

fn stamp(s: &mut System, p: &Prepared, state: State, companion: Companion) {
    let pin = |i: usize| p.pins[i];
    match (&p.element.kind, state) {
        (ElementKind::Resistor { resistance }, _) => {
            conductance(s, 1.0 / resistance, pin(0), pin(1))
        }
        (
            ElementKind::Switch {
                contact_resistance,
                closed,
            },
            _,
        ) => {
            if *closed == 1.0 {
                conductance(s, 1.0 / contact_resistance, pin(0), pin(1));
            }
        }
        (ElementKind::Capacitor { .. }, _) => {
            conductance(s, companion.gain, pin(0), pin(1));
            current(s, companion.offset, pin(0), pin(1));
        }
        (ElementKind::Inductor { .. }, _) => {
            branch_kcl(s, p.branch, pin(0), pin(1));
            branch_voltage(s, p.branch, pin(0), pin(1), companion.offset);
            s.add(p.branch, p.branch, -companion.gain);
        }
        (ElementKind::VoltageSource { voltage }, _) => {
            branch_kcl(s, p.branch, pin(0), pin(1));
            branch_voltage(s, p.branch, pin(0), pin(1), *voltage);
        }
        (ElementKind::CurrentSource { current: i }, _) => current(s, *i, pin(0), pin(1)),
        (
            ElementKind::Diode {
                saturation_current,
                emission_coefficient,
                series_resistance,
            },
            State::Junction { vd },
        ) => {
            let anode = p.internal.or(pin(0));
            if p.internal.is_some() {
                conductance(s, 1.0 / series_resistance, pin(0), p.internal);
            }
            let (id, gd) = junction(
                *saturation_current,
                emission_coefficient * THERMAL_VOLTAGE,
                vd,
            );
            conductance(s, gd, anode, pin(1));
            current(s, id - gd * vd, anode, pin(1));
        }
        (
            ElementKind::LinearRegulator {
                output_voltage,
                dropout_voltage,
                quiescent_current,
            },
            State::Regulator { mode },
        ) => {
            let (input, output, ground) = (pin(0), pin(1), pin(2));
            branch_kcl(s, p.branch, output, input);
            match mode {
                RegulatorMode::Regulating => {
                    branch_voltage(s, p.branch, output, ground, *output_voltage);
                    current(s, *quiescent_current, input, ground);
                }
                RegulatorMode::Dropout => {
                    branch_voltage(s, p.branch, output, input, -dropout_voltage);
                    current(s, *quiescent_current, input, ground);
                }
                RegulatorMode::Off => {
                    // No current through the pass element.
                    s.add(p.branch, p.branch, 1.0);
                    conductance(
                        s,
                        regulator_off_conductance(*quiescent_current, *dropout_voltage),
                        input,
                        ground,
                    );
                }
            }
        }
        (
            ElementKind::Bjt {
                polarity,
                saturation_current,
                forward_beta,
                reverse_beta,
                early_voltage,
            },
            State::Bjt { vbe, vbc },
        ) => {
            let sign = polarity.sign();
            let (collector, base, emitter) = (pin(0), pin(1), pin(2));
            let point = bjt(
                *saturation_current,
                *forward_beta,
                *reverse_beta,
                *early_voltage,
                THERMAL_VOLTAGE,
                vbe,
                vbc,
            );
            let terms = |(g_be, g_bc): (f64, f64)| {
                [
                    (g_be, sign * vbe, base, emitter),
                    (g_bc, sign * vbc, base, collector),
                ]
            };
            let (gc, gb) = (point.gc, point.gb);
            nonlinear_current(s, collector, sign * point.ic, &terms(gc));
            nonlinear_current(s, base, sign * point.ib, &terms(gb));
            nonlinear_current(
                s,
                emitter,
                -sign * (point.ic + point.ib),
                &terms((-gc.0 - gb.0, -gc.1 - gb.1)),
            );
        }
        (
            ElementKind::Mosfet {
                channel,
                threshold_voltage,
                transconductance,
                channel_length_modulation,
            },
            State::Mosfet { vgs, vds },
        ) => {
            let sign = channel.sign();
            let (drain, gate, source) = (pin(0), pin(1), pin(2));
            let (id, gm, gds) = mosfet(
                sign * threshold_voltage,
                *transconductance,
                *channel_length_modulation,
                vgs,
                vds,
            );
            let terms = |g: f64| {
                [
                    (g * gm, sign * vgs, gate, source),
                    (g * gds, sign * vds, drain, source),
                ]
            };
            nonlinear_current(s, drain, sign * id, &terms(1.0));
            nonlinear_current(s, source, -sign * id, &terms(-1.0));
        }
        _ => unreachable!("state always matches the element kind"),
    }
}

/// Stamps a current `i0` flowing into the device at `node`, linearised over its controlling voltages. Each term is
/// `(∂i/∂u, u at the operating point, p, n)` for a voltage `u = V(p) − V(n)`.
fn nonlinear_current(s: &mut System, node: Node, i0: f64, terms: &[(f64, f64, Node, Node)]) {
    let Some(k) = node else { return };
    let mut constant = i0;
    for &(g, u0, p, n) in terms {
        if let Some(p) = p {
            s.add(k, p, g);
        }
        if let Some(n) = n {
            s.add(k, n, -g);
        }
        constant -= g * u0;
    }
    s.add_rhs(k, -constant);
}

/// Moves stateful elements to the operating point implied by `x`. Returns `false` if anything moved enough
/// that another iteration is needed.
fn update(p: &Prepared, state: &mut State, x: &[f64]) -> bool {
    let v = |n: Node| n.map_or(0.0, |i| x[i]);
    match (&p.element.kind, state) {
        (
            ElementKind::Diode {
                saturation_current,
                emission_coefficient,
                ..
            },
            State::Junction { vd },
        ) => {
            let nvt = emission_coefficient * THERMAL_VOLTAGE;
            let proposed = v(p.internal.or(p.pins[0])) - v(p.pins[1]);
            let limited = limit_junction(
                proposed,
                *vd,
                nvt,
                critical_voltage(*saturation_current, nvt),
            );
            let settled =
                limited == proposed && (limited - *vd).abs() <= RELTOL * limited.abs() + VNTOL;
            *vd = limited;
            settled
        }
        (
            ElementKind::LinearRegulator {
                output_voltage,
                dropout_voltage,
                ..
            },
            State::Regulator { mode },
        ) => {
            let headroom = v(p.pins[0]) - v(p.pins[2]) - dropout_voltage;
            let next = mode.toward(RegulatorMode::of(headroom, *output_voltage));
            let settled = next == *mode;
            *mode = next;
            settled
        }
        (
            ElementKind::Bjt {
                polarity,
                saturation_current,
                ..
            },
            State::Bjt { vbe, vbc },
        ) => {
            let sign = polarity.sign();
            let (collector, base, emitter) = (v(p.pins[0]), v(p.pins[1]), v(p.pins[2]));
            let vcrit = critical_voltage(*saturation_current, THERMAL_VOLTAGE);
            let mut settled = true;
            for (state, proposed) in [
                (vbe, sign * (base - emitter)),
                (vbc, sign * (base - collector)),
            ] {
                let limited = limit_junction(proposed, *state, THERMAL_VOLTAGE, vcrit);
                settled &= limited == proposed
                    && (limited - *state).abs() <= RELTOL * limited.abs() + VNTOL;
                *state = limited;
            }
            settled
        }
        (
            ElementKind::Mosfet {
                channel,
                threshold_voltage,
                ..
            },
            State::Mosfet { vgs, vds },
        ) => {
            let sign = channel.sign();
            let vto = sign * threshold_voltage;
            let (drain, gate, source) = (v(p.pins[0]), v(p.pins[1]), v(p.pins[2]));
            let (proposed_gs, proposed_ds) = (sign * (gate - source), sign * (drain - source));
            // As SPICE does, limit whichever of gate–source and gate–drain is acting as the gate drive.
            let (next_gs, next_ds) = if *vds >= 0.0 {
                let gs = limit_fet(proposed_gs, *vgs, vto);
                (
                    gs,
                    limit_drain_source(gs - (proposed_gs - proposed_ds), *vds),
                )
            } else {
                let gd = limit_fet(proposed_gs - proposed_ds, *vgs - *vds, vto);
                let ds = -limit_drain_source(-(proposed_gs - gd), -*vds);
                (gd + ds, ds)
            };
            // Rebuilding one voltage from the other rounds, so compare within tolerance rather than exactly.
            let settled = [
                (next_gs, proposed_gs),
                (next_ds, proposed_ds),
                (next_gs, *vgs),
                (next_ds, *vds),
            ]
            .iter()
            .all(|(a, b)| (a - b).abs() <= RELTOL * a.abs() + VNTOL);
            (*vgs, *vds) = (next_gs, next_ds);
            settled
        }
        _ => true,
    }
}

fn report(
    circuit: &Circuit,
    names: &[&str],
    prepared: &[Prepared],
    x: &[f64],
    companions: &[Companion],
    iterations: usize,
) -> DcSolution {
    let v = |n: Node| n.map_or(0.0, |i| x[i]);
    let mut node_voltages: BTreeMap<String, f64> = names
        .iter()
        .enumerate()
        .map(|(i, n)| ((*n).to_owned(), x[i]))
        .collect();
    node_voltages.insert(circuit.ground.clone(), 0.0);

    let mut pin_currents = BTreeMap::new();
    let mut branch_currents = BTreeMap::new();
    let mut component_power = BTreeMap::new();
    for (p, companion) in prepared.iter().zip(companions) {
        let pin = |i: usize| p.pins[i];
        let currents = match &p.element.kind {
            ElementKind::Resistor { resistance } => {
                let i = (v(pin(0)) - v(pin(1))) / resistance;
                vec![i, -i]
            }
            ElementKind::Switch {
                contact_resistance,
                closed,
            } => {
                let i = if *closed == 1.0 {
                    (v(pin(0)) - v(pin(1))) / contact_resistance
                } else {
                    0.0
                };
                vec![i, -i]
            }
            ElementKind::Capacitor { .. } => {
                let i = companion.gain * (v(pin(0)) - v(pin(1))) + companion.offset;
                vec![i, -i]
            }
            ElementKind::Inductor { .. } | ElementKind::VoltageSource { .. } => {
                vec![x[p.branch], -x[p.branch]]
            }
            ElementKind::CurrentSource { current } => vec![*current, -*current],
            ElementKind::Diode {
                saturation_current,
                emission_coefficient,
                series_resistance,
            } => {
                let i = match p.internal {
                    Some(internal) => (v(pin(0)) - x[internal]) / series_resistance,
                    None => {
                        junction(
                            *saturation_current,
                            emission_coefficient * THERMAL_VOLTAGE,
                            v(pin(0)) - v(pin(1)),
                        )
                        .0
                    }
                };
                vec![i, -i]
            }
            ElementKind::LinearRegulator {
                output_voltage,
                dropout_voltage,
                quiescent_current,
            } => {
                let i = x[p.branch];
                let supply = v(pin(0)) - v(pin(2));
                let bias = match RegulatorMode::of(supply - dropout_voltage, *output_voltage) {
                    RegulatorMode::Off => {
                        supply * regulator_off_conductance(*quiescent_current, *dropout_voltage)
                    }
                    _ => *quiescent_current,
                };
                vec![-i + bias, i, -bias]
            }
            ElementKind::Bjt {
                polarity,
                saturation_current,
                forward_beta,
                reverse_beta,
                early_voltage,
            } => {
                let sign = polarity.sign();
                let point = bjt(
                    *saturation_current,
                    *forward_beta,
                    *reverse_beta,
                    *early_voltage,
                    THERMAL_VOLTAGE,
                    sign * (v(pin(1)) - v(pin(2))),
                    sign * (v(pin(1)) - v(pin(0))),
                );
                let (ic, ib) = (sign * point.ic, sign * point.ib);
                vec![ic, ib, -ic - ib]
            }
            ElementKind::Mosfet {
                channel,
                threshold_voltage,
                transconductance,
                channel_length_modulation,
            } => {
                let sign = channel.sign();
                let (id, ..) = mosfet(
                    sign * threshold_voltage,
                    *transconductance,
                    *channel_length_modulation,
                    sign * (v(pin(1)) - v(pin(2))),
                    sign * (v(pin(0)) - v(pin(2))),
                );
                vec![sign * id, 0.0, -sign * id]
            }
        };
        let power = currents
            .iter()
            .enumerate()
            .map(|(i, c)| v(pin(i)) * c)
            .sum();
        let id = p.element.id.clone();
        branch_currents.insert(id.clone(), currents[0]);
        component_power.insert(id.clone(), power);
        pin_currents.insert(id, currents);
    }

    DcSolution {
        node_voltages,
        branch_currents,
        pin_currents,
        component_power,
        iterations,
    }
}
