use std::f64::consts::TAU;

use echidna_solver::{
    AcOptions, AcSolution, BjtPolarity, Circuit, Element, ElementKind, SolveError, THERMAL_VOLTAGE,
    solve_ac,
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

fn sweep(circuit: &Circuit, source: &str, start: f64, stop: f64) -> AcSolution {
    solve_ac(
        circuit,
        &AcOptions {
            source: source.to_owned(),
            start_frequency: start,
            stop_frequency: stop,
            points_per_decade: 20,
        },
    )
    .expect("sweep solves")
}

/// The sample nearest `f`, which the sweeps below place exactly on a point.
fn at(solution: &AcSolution, node: &str, f: f64) -> echidna_solver::Phasor {
    let i = solution
        .frequencies
        .iter()
        .position(|&x| (x / f - 1.0).abs() < 1e-9)
        .expect("frequency is on the sweep");
    solution.node_voltages[node][i]
}

#[test]
fn rc_low_pass_is_3_db_down_and_45_degrees_behind_at_its_corner() {
    // 1 kΩ and 159.154943 nF put the corner at 1 kHz.
    let c = 1.0 / (TAU * 1e3 * 1e3);
    let rc = circuit(vec![
        source("V1", "in", "0", 0.0),
        resistor("R1", "in", "out", 1e3),
        capacitor("C1", "out", "0", c),
    ]);
    let solution = sweep(&rc, "V1", 10.0, 1e5);
    let corner = at(&solution, "out", 1e3);
    assert!((corner.magnitude() - 0.5f64.sqrt()).abs() < 1e-9);
    assert!((corner.phase_degrees() + 45.0).abs() < 1e-6);
    // A decade below, it passes almost everything; a decade above, a tenth, as a first-order filter does.
    assert!((at(&solution, "out", 100.0).magnitude() - 1.0 / 1.01f64.sqrt()).abs() < 1e-9);
    assert!((at(&solution, "out", 1e4).magnitude() - 1.0 / 101f64.sqrt()).abs() < 1e-9);
    assert!((at(&solution, "in", 1e4).magnitude() - 1.0).abs() < 1e-12);
}

#[test]
fn series_rlc_passes_everything_at_resonance() {
    // 10 mH and 2.533 µF resonate at 1 kHz; the resistor is the only impedance left there.
    let (l, f0) = (10e-3, 1e3);
    let c = 1.0 / ((TAU * f0).powi(2) * l);
    let rlc = circuit(vec![
        source("V1", "in", "0", 0.0),
        inductor("L1", "in", "a", l),
        capacitor("C1", "a", "out", c),
        resistor("R1", "out", "0", 50.0),
    ]);
    let solution = sweep(&rlc, "V1", 100.0, 1e4);
    let peak = at(&solution, "out", f0);
    assert!((peak.magnitude() - 1.0).abs() < 1e-9);
    assert!(peak.phase_degrees().abs() < 1e-6);
    // The source delivers 1 V across 50 Ω, so 20 mA flows out of its + pin, which reads as −20 mA into it.
    let i = solution
        .frequencies
        .iter()
        .position(|&x| (x / f0 - 1.0).abs() < 1e-9)
        .unwrap();
    assert!((solution.branch_currents["V1"][i].re + 0.02).abs() < 1e-9);
    assert!((solution.branch_currents["L1"][i].re - 0.02).abs() < 1e-9);
}

#[test]
fn common_emitter_gain_follows_the_transconductance_at_the_operating_point() {
    let amplifier = circuit(vec![
        source("VCC", "vcc", "0", 12.0),
        source("VIN", "b", "0", 0.65),
        resistor("RC", "vcc", "c", 4.7e3),
        el(
            "Q1",
            &["c", "b", "0"],
            ElementKind::Bjt {
                polarity: BjtPolarity::Npn,
                saturation_current: 1e-14,
                forward_beta: 200.0,
                reverse_beta: 1.0,
                early_voltage: 0.0,
            },
        ),
    ]);
    let solution = sweep(&amplifier, "VIN", 1.0, 1e3);
    let ic = solution.operating_point.pin_currents["Q1"][0];
    let gain = at(&solution, "c", 100.0);
    let expected = ic / THERMAL_VOLTAGE * 4.7e3;
    assert!(ic > 1e-4, "biased into conduction: {ic} A");
    assert!(
        (gain.magnitude() / expected - 1.0).abs() < 1e-3,
        "{} vs {expected}",
        gain.magnitude()
    );
    // Inverting: the collector falls as the base rises.
    assert!((gain.phase_degrees().abs() - 180.0).abs() < 1e-6);
    // The supply holds still, so it carries no signal.
    assert!(at(&solution, "vcc", 100.0).magnitude() < 1e-12);
}

#[test]
fn current_source_drive_develops_its_impedance_across_a_resistor() {
    let rc = circuit(vec![
        el(
            "I1",
            &["0", "out"],
            ElementKind::CurrentSource { current: 0.0 },
        ),
        resistor("R1", "out", "0", 2e3),
    ]);
    let solution = sweep(&rc, "I1", 10.0, 100.0);
    // 1 A driven from ground through the source into `out` develops 2 kV per ampere.
    assert!((at(&solution, "out", 10.0).re / 2e3 - 1.0).abs() < 1e-6);
}

#[test]
fn rejects_a_drive_that_is_not_a_source() {
    let rc = circuit(vec![
        source("V1", "in", "0", 1.0),
        resistor("R1", "in", "0", 1e3),
    ]);
    let outcome = solve_ac(
        &rc,
        &AcOptions {
            source: "R1".to_owned(),
            start_frequency: 1.0,
            stop_frequency: 10.0,
            points_per_decade: 1,
        },
    );
    assert!(matches!(outcome, Err(SolveError::InvalidAnalysis { .. })));
}
