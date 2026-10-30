use echidna_solver::{
    BjtPolarity, Channel, Circuit, DcSolution, Element, ElementKind, SolveError, THERMAL_VOLTAGE,
    solve_dc,
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

fn regulator(supply: f64, load: f64) -> DcSolution {
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
fn regulator_behind_an_open_switch_is_off() {
    // An open switch: only its insulation resistance joins the supply to the regulator.
    let s = solve_dc(&circuit(vec![
        source("V1", "vsup", "0", 5.0),
        resistor("SW1", "vsup", "vin", 1e8),
        el(
            "U1",
            &["vin", "vout", "0"],
            ElementKind::LinearRegulator {
                output_voltage: 3.3,
                dropout_voltage: 1.1,
                quiescent_current: 5e-3,
            },
        ),
        resistor("R1", "vout", "a", 150.0),
        led("D1", "a", "0"),
    ]))
    .unwrap();
    let vin = s.node_voltages["vin"];
    assert!((0.0..1e-3).contains(&vin), "input {vin}");
    assert!(s.node_voltages["vout"].abs() < 1e-6);
    assert!(s.branch_currents["D1"].abs() < 1e-9);
    close(s.pin_currents["U1"][0], vin * 5e-3 / 1.1, 1e-12);
}

fn switched_led(closed: f64) -> DcSolution {
    solve_dc(&circuit(vec![
        source("V1", "vin", "0", 5.0),
        el(
            "SW1",
            &["vin", "sw"],
            ElementKind::Switch {
                contact_resistance: 0.03,
                closed,
            },
        ),
        resistor("R1", "sw", "a", 220.0),
        led("D1", "a", "0"),
    ]))
    .unwrap()
}

#[test]
fn closed_switch_conducts_through_its_contact_resistance() {
    let s = switched_led(1.0);
    let i = s.branch_currents["SW1"];
    assert!(i > 0.01, "current {i}");
    close(
        s.node_voltages["vin"] - s.node_voltages["sw"],
        i * 0.03,
        1e-9,
    );
}

#[test]
fn open_switch_passes_no_current() {
    let s = switched_led(0.0);
    assert_eq!(s.branch_currents["SW1"], 0.0);
    assert_eq!(s.pin_currents["SW1"], vec![0.0, 0.0]);
    assert!(s.branch_currents["D1"].abs() < 1e-12);
    assert_eq!(s.component_power["SW1"], 0.0);
}

#[test]
fn switch_position_must_be_on_or_off() {
    let result = solve_dc(&circuit(vec![
        source("V1", "vin", "0", 5.0),
        el(
            "SW1",
            &["vin", "0"],
            ElementKind::Switch {
                contact_resistance: 0.03,
                closed: 0.5,
            },
        ),
    ]));
    assert!(result.is_err());
}

#[test]
fn unpowered_regulator_draws_nothing() {
    let s = regulator(0.0, 33.0);
    close(s.node_voltages["vout"], 0.0, 1e-9);
    close(s.branch_currents["V1"], 0.0, 1e-12);
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

const BETA_F: f64 = 100.0;
const BJT_IS: f64 = 1e-14;

fn bjt(id: &str, c: &str, b: &str, e: &str, polarity: BjtPolarity, early_voltage: f64) -> Element {
    el(
        id,
        &[c, b, e],
        ElementKind::Bjt {
            polarity,
            saturation_current: BJT_IS,
            forward_beta: BETA_F,
            reverse_beta: 1.0,
            early_voltage,
        },
    )
}

/// Common-emitter stage with a fixed base current: `sign` −1 builds the PNP mirror image.
fn common_emitter(polarity: BjtPolarity, early_voltage: f64) -> DcSolution {
    let sign = match polarity {
        BjtPolarity::Npn => 1.0,
        BjtPolarity::Pnp => -1.0,
    };
    solve_dc(&circuit(vec![
        source("V1", "vcc", "0", sign * 10.0),
        resistor("RC", "vcc", "c", 1_000.0),
        el(
            "I1",
            &["0", "b"],
            ElementKind::CurrentSource {
                current: sign * 10e-6,
            },
        ),
        bjt("Q1", "c", "b", "0", polarity, early_voltage),
    ]))
    .unwrap()
}

#[test]
fn bjt_in_forward_active_has_gain_beta() {
    let s = common_emitter(BjtPolarity::Npn, 0.0);
    let ic = s.pin_currents["Q1"][0];
    close(ic, BETA_F * 10e-6, 1e-6);
    close(s.node_voltages["c"], 10.0 - 1_000.0 * ic, 1e-9);
    close(
        s.node_voltages["b"],
        THERMAL_VOLTAGE * (ic / BJT_IS + 1.0).ln(),
        1e-4,
    );
    let sum: f64 = s.pin_currents["Q1"].iter().sum();
    assert!(sum.abs() < 1e-15, "KCL off by {sum}");
}

#[test]
fn early_effect_raises_collector_current_with_vce() {
    let vaf = 50.0;
    let s = common_emitter(BjtPolarity::Npn, vaf);
    let vbc = s.node_voltages["b"] - s.node_voltages["c"];
    close(
        s.pin_currents["Q1"][0],
        BETA_F * 10e-6 * (1.0 - vbc / vaf),
        1e-5,
    );
}

#[test]
fn pnp_mirrors_npn() {
    let npn = common_emitter(BjtPolarity::Npn, 40.0);
    let pnp = common_emitter(BjtPolarity::Pnp, 40.0);
    for (node, v) in &npn.node_voltages {
        close(-pnp.node_voltages[node], *v, 1e-9);
    }
    for (pin, i) in npn.pin_currents["Q1"].iter().enumerate() {
        close(-pnp.pin_currents["Q1"][pin], *i, 1e-9);
    }
}

#[test]
fn bjt_saturates_when_overdriven() {
    let s = solve_dc(&circuit(vec![
        source("V1", "vcc", "0", 5.0),
        resistor("RB", "vcc", "b", 1_000.0),
        resistor("RC", "vcc", "c", 1_000.0),
        bjt("Q1", "c", "b", "0", BjtPolarity::Npn, 0.0),
    ]))
    .unwrap();
    let [ic, ib, _] = s.pin_currents["Q1"][..] else {
        panic!("three pins")
    };
    assert!(s.node_voltages["c"] < 0.2, "Vce {}", s.node_voltages["c"]);
    assert!(ic < BETA_F * ib);
}

fn mosfet(id: &str, d: &str, g: &str, s: &str, channel: Channel, vto: f64) -> Element {
    el(
        id,
        &[d, g, s],
        ElementKind::Mosfet {
            channel,
            threshold_voltage: vto,
            transconductance: 1e-3,
            channel_length_modulation: 0.0,
        },
    )
}

/// N-channel switch with the gate held at `vg` and the drain pulled up through `rd`, or its p-channel mirror.
fn fet_stage(channel: Channel, vg: f64, rd: f64, swap: bool) -> DcSolution {
    let sign = channel_sign(channel);
    let (d, s) = if swap { ("0", "d") } else { ("d", "0") };
    solve_dc(&circuit(vec![
        source("VDD", "vdd", "0", sign * 10.0),
        source("VG", "g", "0", sign * vg),
        resistor("RD", "vdd", "d", rd),
        mosfet("M1", d, "g", s, channel, sign * 1.0),
    ]))
    .unwrap()
}

fn channel_sign(channel: Channel) -> f64 {
    match channel {
        Channel::N => 1.0,
        Channel::P => -1.0,
    }
}

#[test]
fn mosfet_in_saturation_follows_square_law() {
    let s = fet_stage(Channel::N, 3.0, 1_000.0, false);
    close(s.pin_currents["M1"][0], 0.5e-3 * 2.0_f64.powi(2), 1e-9);
    close(s.node_voltages["d"], 8.0, 1e-9);
    assert_eq!(s.pin_currents["M1"][1], 0.0);
}

#[test]
fn mosfet_in_triode_matches_closed_form() {
    // β(Vov − Vds/2)·Vds = (10 − Vds)/Rd with Vov = 4 V, β = 1 mA/V² and Rd = 10 kΩ.
    let vds = 4.1 - (4.1_f64.powi(2) - 2.0).sqrt();
    let s = fet_stage(Channel::N, 5.0, 10_000.0, false);
    close(s.node_voltages["d"], vds, 1e-9);
}

#[test]
fn mosfet_is_symmetric_in_drain_and_source() {
    let normal = fet_stage(Channel::N, 5.0, 10_000.0, false);
    let swapped = fet_stage(Channel::N, 5.0, 10_000.0, true);
    close(swapped.node_voltages["d"], normal.node_voltages["d"], 1e-9);
    close(
        swapped.pin_currents["M1"][2],
        normal.pin_currents["M1"][0],
        1e-9,
    );
}

#[test]
fn p_channel_mirrors_n_channel() {
    let n = fet_stage(Channel::N, 5.0, 10_000.0, false);
    let p = fet_stage(Channel::P, 5.0, 10_000.0, false);
    close(-p.node_voltages["d"], n.node_voltages["d"], 1e-9);
    close(-p.pin_currents["M1"][0], n.pin_currents["M1"][0], 1e-9);
}

#[test]
fn mosfet_is_off_below_threshold() {
    let s = fet_stage(Channel::N, 0.5, 1_000.0, false);
    assert_eq!(s.pin_currents["M1"][0], 0.0);
    close(s.node_voltages["d"], 10.0, 1e-6);
}

#[test]
fn rejects_bad_transistor_values() {
    let mut q = bjt("Q1", "c", "b", "0", BjtPolarity::Npn, 0.0);
    if let ElementKind::Bjt { forward_beta, .. } = &mut q.kind {
        *forward_beta = 0.0;
    }
    let err = solve_dc(&circuit(vec![q])).unwrap_err();
    assert!(matches!(err, SolveError::InvalidValue { element_id, .. } if element_id == "Q1"));

    let mut m = mosfet("M1", "d", "g", "0", Channel::N, 1.0);
    if let ElementKind::Mosfet {
        transconductance, ..
    } = &mut m.kind
    {
        *transconductance = -1e-3;
    }
    let err = solve_dc(&circuit(vec![m])).unwrap_err();
    assert!(matches!(err, SolveError::InvalidValue { element_id, .. } if element_id == "M1"));
}

#[test]
fn reads_transistors_from_camel_case_json() {
    let json = r#"{
        "ground": "0",
        "elements": [
            { "id": "V1", "kind": "voltageSource", "nodes": ["vcc", "0"], "voltage": 5 },
            { "id": "RB", "kind": "resistor", "nodes": ["vcc", "b"], "resistance": 100000 },
            { "id": "RC", "kind": "resistor", "nodes": ["vcc", "c"], "resistance": 1000 },
            { "id": "Q1", "kind": "bjt", "nodes": ["c", "b", "0"], "polarity": "npn",
              "saturationCurrent": 1e-14, "forwardBeta": 100 },
            { "id": "M1", "kind": "mosfet", "nodes": ["0", "c", "vcc"], "channel": "p",
              "thresholdVoltage": -1, "transconductance": 1e-3 }
        ]
    }"#;
    let c: Circuit = serde_json::from_str(json).unwrap();
    let s = solve_dc(&c).unwrap();
    assert!(s.pin_currents["Q1"][0] > 0.0);
    assert_eq!(s.pin_currents["M1"].len(), 3);
}

#[test]
fn regulator_browned_out_by_its_supply_settles_in_dropout() {
    // Regulating would draw 6.6 A, dropping the 1 Ω supply below zero; off would draw nothing, so the input recovers.
    // Only dropout is consistent: 3·V(in) = 5 + 2·1.1, so the input sits at 2.4 V and the output at 1.3 V.
    let s = solve_dc(&circuit(vec![
        source("V1", "supply", "0", 5.0),
        resistor("RS", "supply", "in", 1.0),
        el(
            "U1",
            &["in", "out", "0"],
            ElementKind::LinearRegulator {
                output_voltage: 3.3,
                dropout_voltage: 1.1,
                quiescent_current: 0.0,
            },
        ),
        resistor("RL", "out", "0", 0.5),
    ]))
    .unwrap();
    close(s.node_voltages["in"], 2.4, 1e-9);
    close(s.node_voltages["out"], 1.3, 1e-9);
}
