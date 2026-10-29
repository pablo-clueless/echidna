use std::collections::{BTreeMap, HashMap};

use crate::circuit::{Circuit, DcSolution, Element, ElementKind, SolveError, THERMAL_VOLTAGE};
use crate::matrix::System;

const MAX_ITERATIONS: usize = 150;
const RELTOL: f64 = 1e-6;
const VNTOL: f64 = 1e-9;
const ABSTOL: f64 = 1e-15;
/// Conductance added across every junction, as in SPICE, so a reverse-biased diode never leaves a node floating.
const GMIN: f64 = 1e-12;
/// Conductance from every node to ground, so a half-wired schematic still solves instead of going singular.
const GSHUNT: f64 = 1e-12;

type Node = Option<usize>;

struct Prepared<'a> {
    element: &'a Element,
    pins: Vec<Node>,
    internal: Node,
    branch: usize,
}

#[derive(Clone, Copy)]
enum State {
    None,
    Junction { vd: f64 },
    Regulator { dropout: bool },
}

/// Finds the DC operating point with Newton–Raphson iteration over a Modified Nodal Analysis system.
/// Capacitors are open and inductors are shorts. Diode junction voltages are limited between iterations
/// (SPICE `pnjlim`) so exponential models converge from a cold start.
pub fn solve_dc(circuit: &Circuit) -> Result<DcSolution, SolveError> {
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
    let size = next;

    let mut states: Vec<State> = prepared
        .iter()
        .map(|p| match p.element.kind {
            ElementKind::Diode {
                saturation_current,
                emission_coefficient,
                ..
            } => State::Junction {
                vd: critical_voltage(saturation_current, emission_coefficient * THERMAL_VOLTAGE),
            },
            ElementKind::LinearRegulator { .. } => State::Regulator { dropout: false },
            _ => State::None,
        })
        .collect();

    let mut x = vec![0.0; size];
    for iteration in 1..=MAX_ITERATIONS {
        let mut system = System::new(size);
        for row in 0..external {
            system.add(row, row, GSHUNT);
        }
        for (p, state) in prepared.iter().zip(&states) {
            stamp(&mut system, p, *state);
        }
        let x_new = system.solve().ok_or(SolveError::Singular)?;

        let mut settled = iteration > 1;
        for (p, state) in prepared.iter().zip(states.iter_mut()) {
            settled &= update(p, state, &x_new);
        }
        settled &= x_new.iter().zip(&x).enumerate().all(|(i, (new, old))| {
            let floor = if i < first_branch { VNTOL } else { ABSTOL };
            (new - old).abs() <= RELTOL * new.abs().max(old.abs()) + floor
        });
        x = x_new;

        if settled {
            return Ok(report(circuit, &names, &prepared, &x, iteration));
        }
    }
    Err(SolveError::NoConvergence {
        iterations: MAX_ITERATIONS,
    })
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

fn stamp(s: &mut System, p: &Prepared, state: State) {
    let pin = |i: usize| p.pins[i];
    match (&p.element.kind, state) {
        (ElementKind::Resistor { resistance }, _) => {
            conductance(s, 1.0 / resistance, pin(0), pin(1))
        }
        (ElementKind::Capacitor { .. }, _) => {}
        (ElementKind::Inductor { .. }, _) => {
            branch_kcl(s, p.branch, pin(0), pin(1));
            branch_voltage(s, p.branch, pin(0), pin(1), 0.0);
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
            State::Regulator { dropout },
        ) => {
            let (input, output, ground) = (pin(0), pin(1), pin(2));
            branch_kcl(s, p.branch, output, input);
            if dropout {
                branch_voltage(s, p.branch, output, input, -dropout_voltage);
            } else {
                branch_voltage(s, p.branch, output, ground, *output_voltage);
            }
            current(s, *quiescent_current, input, ground);
        }
        _ => unreachable!("state always matches the element kind"),
    }
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
            State::Regulator { dropout },
        ) => {
            let headroom = v(p.pins[0]) - v(p.pins[2]) - dropout_voltage;
            let next = headroom < *output_voltage;
            let settled = next == *dropout;
            *dropout = next;
            settled
        }
        _ => true,
    }
}

fn junction(is: f64, nvt: f64, vd: f64) -> (f64, f64) {
    let e = (vd / nvt).exp();
    (is * (e - 1.0) + GMIN * vd, is / nvt * e + GMIN)
}

fn critical_voltage(is: f64, nvt: f64) -> f64 {
    nvt * (nvt / (std::f64::consts::SQRT_2 * is)).ln()
}

/// SPICE `pnjlim`: stops a junction voltage jumping so far up the exponential that the next step overflows.
fn limit_junction(proposed: f64, previous: f64, nvt: f64, vcrit: f64) -> f64 {
    if proposed <= vcrit || (proposed - previous).abs() <= 2.0 * nvt {
        return proposed;
    }
    if previous > 0.0 {
        let arg = 1.0 + (proposed - previous) / nvt;
        if arg > 0.0 {
            previous + nvt * arg.ln()
        } else {
            vcrit
        }
    } else {
        nvt * (proposed / nvt).ln()
    }
}

fn report(
    circuit: &Circuit,
    names: &[&str],
    prepared: &[Prepared],
    x: &[f64],
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
    for p in prepared {
        let pin = |i: usize| p.pins[i];
        let currents = match &p.element.kind {
            ElementKind::Resistor { resistance } => {
                let i = (v(pin(0)) - v(pin(1))) / resistance;
                vec![i, -i]
            }
            ElementKind::Capacitor { .. } => vec![0.0, 0.0],
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
                quiescent_current, ..
            } => {
                let i = x[p.branch];
                vec![-i + quiescent_current, i, -quiescent_current]
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
