use echidna_solver::{
    Circuit, Element, ElementKind, SolveError, TransientOptions, TransientSolution, solve_dc,
    solve_transient,
};

fn el(id: &str, nodes: &[&str], kind: ElementKind) -> Element {
    Element {
        id: id.to_owned(),
        nodes: nodes.iter().map(|n| (*n).to_owned()).collect(),
        kind,
    }
}

fn circuit(elements: Vec<Element>) -> Circuit {
    Circuit {
        ground: "0".to_owned(),
        elements,
    }
}

fn resistor(id: &str, a: &str, b: &str, resistance: f64) -> Element {
    el(id, &[a, b], ElementKind::Resistor { resistance })
}

fn capacitor(id: &str, a: &str, b: &str, capacitance: f64) -> Element {
    el(id, &[a, b], ElementKind::Capacitor { capacitance })
}

fn inductor(id: &str, a: &str, b: &str, inductance: f64) -> Element {
    el(id, &[a, b], ElementKind::Inductor { inductance })
}

fn source(id: &str, p: &str, n: &str, voltage: f64) -> Element {
    el(id, &[p, n], ElementKind::VoltageSource { voltage })
}

fn run(circuit: &Circuit, stop_time: f64, time_step: f64) -> TransientSolution {
    solve_transient(
        circuit,
        &TransientOptions {
            stop_time,
            time_step,
        },
    )
    .expect("transient run")
}

/// Largest difference between a series and `expected(t)`.
fn worst(solution: &TransientSolution, series: &[f64], expected: impl Fn(f64) -> f64) -> f64 {
    solution
        .times
        .iter()
        .zip(series)
        .map(|(t, v)| (v - expected(*t)).abs())
        .fold(0.0, f64::max)
}

#[test]
fn rc_charges_exponentially_from_switch_on() {
    let (supply, r, c) = (5.0, 1000.0, 1e-6);
    let tau = r * c;
    let solution = run(
        &circuit(vec![
            source("V1", "in", "0", supply),
            resistor("R1", "in", "out", r),
            capacitor("C1", "out", "0", c),
        ]),
        5.0 * tau,
        tau / 100.0,
    );
    assert_eq!(solution.times.len(), 500);
    assert!((solution.times[499] - 5.0 * tau).abs() < 1e-15);

    let charge = |t: f64| supply * (1.0 - (-t / tau).exp());
    assert!(worst(&solution, &solution.node_voltages["out"], charge) < 2e-3 * supply);
    let current = |t: f64| supply / r * (-t / tau).exp();
    assert!(worst(&solution, &solution.pin_currents["C1"][0], current) < 2e-3 * supply / r);
}

#[test]
fn rl_current_rises_towards_ohms_law() {
    let (supply, r, l) = (12.0, 100.0, 10e-3);
    let tau = l / r;
    let solution = run(
        &circuit(vec![
            source("V1", "in", "0", supply),
            resistor("R1", "in", "a", r),
            inductor("L1", "a", "0", l),
        ]),
        5.0 * tau,
        tau / 100.0,
    );
    let rise = |t: f64| supply / r * (1.0 - (-t / tau).exp());
    assert!(worst(&solution, &solution.pin_currents["L1"][0], rise) < 2e-3 * supply / r);
    let across = |t: f64| supply * (-t / tau).exp();
    assert!(worst(&solution, &solution.node_voltages["a"], across) < 5e-3 * supply);
}

#[test]
fn series_rlc_rings_at_its_damped_frequency() {
    let (supply, r, l, c): (f64, f64, f64, f64) = (5.0, 10.0, 1e-3, 1e-6);
    let alpha = r / (2.0 * l);
    let omega = (1.0 / (l * c) - alpha * alpha).sqrt();
    let solution = run(
        &circuit(vec![
            source("V1", "in", "0", supply),
            resistor("R1", "in", "a", r),
            inductor("L1", "a", "b", l),
            capacitor("C1", "b", "0", c),
        ]),
        1e-3,
        2e-7,
    );
    let response = |t: f64| {
        supply
            * (1.0 - (-alpha * t).exp() * ((omega * t).cos() + alpha / omega * (omega * t).sin()))
    };
    assert!(worst(&solution, &solution.node_voltages["b"], response) < 5e-3 * supply);
}

#[test]
fn settles_to_the_dc_operating_point() {
    let elements = vec![
        source("V1", "in", "0", 5.0),
        resistor("R1", "in", "a", 1000.0),
        capacitor("C1", "a", "0", 10e-6),
        el(
            "D1",
            &["a", "0"],
            ElementKind::Diode {
                saturation_current: 3.23e-19,
                emission_coefficient: 2.0,
                series_resistance: 0.0,
            },
        ),
    ];
    let c = circuit(elements);
    let dc = solve_dc(&c).expect("DC");
    let solution = run(&c, 0.1, 1e-4);
    let last = |series: &[f64]| *series.last().expect("samples");
    assert!((last(&solution.node_voltages["a"]) - dc.node_voltages["a"]).abs() < 1e-6);
    assert!((last(&solution.pin_currents["D1"][0]) - dc.pin_currents["D1"][0]).abs() < 1e-9);
    assert!(last(&solution.pin_currents["C1"][0]).abs() < 1e-9);
    // The LED stays dark until the capacitor has charged to its forward voltage.
    assert!(solution.pin_currents["D1"][0][0] < 1e-9);
}

#[test]
fn energy_drawn_from_the_supply_is_stored_or_dissipated() {
    let (supply, r, c) = (5.0, 1000.0, 1e-6);
    let tau = r * c;
    let h = tau / 200.0;
    let solution = run(
        &circuit(vec![
            source("V1", "in", "0", supply),
            resistor("R1", "in", "out", r),
            capacitor("C1", "out", "0", c),
        ]),
        10.0 * tau,
        h,
    );
    let energy = |id: &str| solution.component_power[id].iter().sum::<f64>() * h;
    // Half of the supplied energy ends up in the capacitor and half is lost in the resistor.
    let stored = 0.5 * c * supply * supply;
    assert!((energy("C1") - stored).abs() < 0.01 * stored);
    assert!((energy("R1") - stored).abs() < 0.01 * stored);
    assert!((energy("V1") + 2.0 * stored).abs() < 0.01 * stored);
}

#[test]
fn reports_invalid_settings() {
    let c = circuit(vec![
        source("V1", "in", "0", 5.0),
        resistor("R1", "in", "0", 1000.0),
    ]);
    let result = solve_transient(
        &c,
        &TransientOptions {
            stop_time: -1.0,
            time_step: 1e-6,
        },
    );
    assert!(matches!(result, Err(SolveError::InvalidAnalysis { .. })));
}
