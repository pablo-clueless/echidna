use echidna_solver::{Circuit, Element, ElementKind, SolveError, THERMAL_VOLTAGE, solve_dc};

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

fn source(id: &str, p: &str, n: &str, voltage: f64) -> Element {
    el(id, &[p, n], ElementKind::VoltageSource { voltage })
}

const LED_IS: f64 = 1e-19;
const LED_N: f64 = 2.0;

fn led(id: &str, a: &str, k: &str) -> Element {
    el(
        id,
        &[a, k],
        ElementKind::Diode {
            saturation_current: LED_IS,
            emission_coefficient: LED_N,
            series_resistance: 0.0,
        },
    )
}

/// Solves `supply = I·R + n·Vt·ln(I/Is + 1)` by bisection, as an independent check on Newton–Raphson.
fn led_current(supply: f64, resistance: f64) -> f64 {
    let f = |i: f64| supply - i * resistance - LED_N * THERMAL_VOLTAGE * (i / LED_IS + 1.0).ln();
    let (mut lo, mut hi) = (0.0, supply / resistance);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if f(mid) > 0.0 { lo = mid } else { hi = mid }
    }
    0.5 * (lo + hi)
}

fn close(actual: f64, expected: f64, rel: f64) {
    assert!(
        (actual - expected).abs() <= rel * expected.abs().max(1e-12),
        "expected {expected}, got {actual}"
    );
}

#[test]
fn voltage_divider() {
    let s = solve_dc(&circuit(vec![
        source("V1", "in", "0", 5.0),
        resistor("R1", "in", "out", 1_000.0),
        resistor("R2", "out", "0", 2_000.0),
    ]))
    .unwrap();
    close(s.node_voltages["out"], 10.0 / 3.0, 1e-8);
    close(s.branch_currents["V1"], -5.0 / 3_000.0, 1e-8);
    close(
        s.component_power["R1"],
        (5.0_f64 / 3.0).powi(2) / 1_000.0,
        1e-8,
    );
    assert_eq!(s.node_voltages["0"], 0.0);
}

#[test]
fn current_source_follows_spice_direction() {
    let s = solve_dc(&circuit(vec![
        el(
            "I1",
            &["0", "a"],
            ElementKind::CurrentSource { current: 1e-3 },
        ),
        resistor("R1", "a", "0", 1_000.0),
    ]))
    .unwrap();
    close(s.node_voltages["a"], 1.0, 1e-9);
}

#[test]
fn capacitor_is_open_and_inductor_is_short_at_dc() {
    let s = solve_dc(&circuit(vec![
        source("V1", "in", "0", 3.0),
        el(
            "L1",
            &["in", "mid"],
            ElementKind::Inductor { inductance: 1e-6 },
        ),
        resistor("R1", "mid", "0", 100.0),
        el(
            "C1",
            &["mid", "0"],
            ElementKind::Capacitor { capacitance: 1e-6 },
        ),
    ]))
    .unwrap();
    close(s.node_voltages["mid"], 3.0, 1e-9);
    close(s.branch_currents["L1"], 0.03, 1e-9);
    assert_eq!(s.branch_currents["C1"], 0.0);
}

#[test]
fn led_with_series_resistor() {
    for (supply, resistance) in [(5.0, 150.0), (3.3, 68.0), (12.0, 1_000.0), (2.0, 10.0)] {
        let s = solve_dc(&circuit(vec![
            source("V1", "vcc", "0", supply),
            resistor("R1", "vcc", "a", resistance),
            led("D1", "a", "0"),
        ]))
        .unwrap();
        close(
            s.branch_currents["D1"],
            led_current(supply, resistance),
            1e-6,
        );
    }
}

#[test]
fn reverse_biased_diode_blocks() {
    let s = solve_dc(&circuit(vec![
        source("V1", "vcc", "0", 5.0),
        resistor("R1", "vcc", "k", 1_000.0),
        led("D1", "0", "k"),
    ]))
    .unwrap();
    assert!(s.branch_currents["D1"].abs() < 1e-9);
    close(s.node_voltages["k"], 5.0, 1e-6);
}

#[test]
fn diode_series_resistance_adds_drop() {
    let with_rs = |rs: f64| {
        solve_dc(&circuit(vec![
            source("V1", "vcc", "0", 5.0),
            resistor("R1", "vcc", "a", 100.0),
            el(
                "D1",
                &["a", "0"],
                ElementKind::Diode {
                    saturation_current: 1e-14,
                    emission_coefficient: 1.0,
                    series_resistance: rs,
                },
            ),
        ]))
        .unwrap()
    };
    let ideal = with_rs(0.0);
    let real = with_rs(10.0);
    assert!(real.node_voltages["a"] > ideal.node_voltages["a"] + 0.2);
    assert!(real.branch_currents["D1"] < ideal.branch_currents["D1"]);
}

fn regulator(supply: f64, load: f64) -> echidna_solver::DcSolution {
    solve_dc(&circuit(vec![
        source("V1", "vin", "0", supply),
        el(
            "U1",
            &["vin", "vout", "0"],
            ElementKind::LinearRegulator {
                output_voltage: 3.3,
                dropout_voltage: 0.3,
                quiescent_current: 5e-3,
            },
        ),
        resistor("RL", "vout", "0", load),
    ]))
    .unwrap()
}

#[test]
fn regulator_holds_output_and_passes_current() {
    let s = regulator(5.0, 33.0);
    close(s.node_voltages["vout"], 3.3, 1e-9);
    let load = 0.1;
    close(s.branch_currents["RL"], load, 1e-9);
    close(-s.branch_currents["V1"], load + 5e-3, 1e-9);
    close(
        s.component_power["U1"],
        (5.0 - 3.3) * load + 5.0 * 5e-3,
        1e-9,
    );
}

#[test]
fn regulator_drops_out() {
    let s = regulator(3.4, 33.0);
    close(s.node_voltages["vout"], 3.1, 1e-9);
}

#[test]
fn power_is_conserved() {
    let s = solve_dc(&circuit(vec![
        source("V1", "vin", "0", 5.0),
        el(
            "U1",
            &["vin", "vout", "0"],
            ElementKind::LinearRegulator {
                output_voltage: 3.3,
                dropout_voltage: 0.3,
                quiescent_current: 1e-3,
            },
        ),
        resistor("R1", "vout", "a", 47.0),
        led("D1", "a", "0"),
    ]))
    .unwrap();
    let total: f64 = s.component_power.values().sum();
    assert!(total.abs() < 1e-9, "net power {total}");
}

#[test]
fn floating_node_still_solves() {
    let s = solve_dc(&circuit(vec![
        source("V1", "vin", "0", 5.0),
        resistor("R1", "vin", "0", 1_000.0),
        el(
            "C1",
            &["vin", "loose"],
            ElementKind::Capacitor { capacitance: 1e-9 },
        ),
    ]))
    .unwrap();
    assert!(s.node_voltages["loose"].abs() < 1e-6);
}

#[test]
fn source_loop_is_singular() {
    let err = solve_dc(&circuit(vec![
        source("V1", "a", "0", 5.0),
        source("V2", "a", "0", 3.0),
    ]))
    .unwrap_err();
    assert_eq!(err, SolveError::Singular);
}

#[test]
fn rejects_bad_values() {
    let err = solve_dc(&circuit(vec![resistor("R1", "a", "0", 0.0)])).unwrap_err();
    assert!(matches!(err, SolveError::InvalidValue { element_id, .. } if element_id == "R1"));
    let err = solve_dc(&circuit(vec![el(
        "R2",
        &["a"],
        ElementKind::Resistor { resistance: 1.0 },
    )]))
    .unwrap_err();
    assert!(matches!(
        err,
        SolveError::PinCount {
            expected: 2,
            actual: 1,
            ..
        }
    ));
}

#[test]
fn reads_camel_case_json() {
    let json = r#"{
        "ground": "gnd",
        "elements": [
            { "id": "V1", "kind": "voltageSource", "nodes": ["vcc", "gnd"], "voltage": 5 },
            { "id": "R1", "kind": "resistor", "nodes": ["vcc", "a"], "resistance": 220 },
            { "id": "D1", "kind": "diode", "nodes": ["a", "gnd"], "saturationCurrent": 1e-19, "emissionCoefficient": 2 }
        ]
    }"#;
    let c: Circuit = serde_json::from_str(json).unwrap();
    let s = solve_dc(&c).unwrap();
    close(s.branch_currents["D1"], led_current(5.0, 220.0), 1e-6);
    let out = serde_json::to_value(&s).unwrap();
    assert!(out["nodeVoltages"]["a"].is_number());
    assert!(out["componentPower"]["R1"].is_number());
}
