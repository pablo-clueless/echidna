use serde::{Deserialize, Serialize};

/// Thermal voltage kT/q at 300.15 K, in volts.
pub const THERMAL_VOLTAGE: f64 = 0.025_864;

/// A circuit as the solver sees it: named nodes joined by elements. Node names are net IDs from the netlist.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Circuit {
    pub ground: String,
    pub elements: Vec<Element>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Element {
    pub id: String,
    /// Node per pin, in the order the element kind defines.
    pub nodes: Vec<String>,
    #[serde(flatten)]
    pub kind: ElementKind,
}

/// Element models. Pin order is given per variant; currents are SI amperes, voltages volts, resistance ohms.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ElementKind {
    /// Pins: a, b.
    Resistor { resistance: f64 },
    /// Pins: a, b. Open circuit at DC.
    Capacitor { capacitance: f64 },
    /// Pins: a, b. Short circuit at DC.
    Inductor { inductance: f64 },
    /// Pins: +, −. Holds V(+) − V(−) at `voltage`.
    VoltageSource { voltage: f64 },
    /// Pins: +, −. Drives `current` from + through the source to −, as in SPICE.
    CurrentSource { current: f64 },
    /// Pins: anode, cathode. Shockley diode with optional series resistance; LEDs use the same model.
    Diode {
        saturation_current: f64,
        #[serde(default = "unity")]
        emission_coefficient: f64,
        #[serde(default)]
        series_resistance: f64,
    },
    /// Pins: in, out, ground. Behavioural linear regulator: holds `output_voltage` until the input falls
    /// within `dropout_voltage` of it, passes the load current from in to out, and draws `quiescent_current`.
    LinearRegulator {
        output_voltage: f64,
        #[serde(default)]
        dropout_voltage: f64,
        #[serde(default)]
        quiescent_current: f64,
    },
}

const fn unity() -> f64 {
    1.0
}

impl ElementKind {
    pub(crate) fn pin_count(&self) -> usize {
        match self {
            Self::LinearRegulator { .. } => 3,
            _ => 2,
        }
    }

    /// Number of extra MNA unknowns (branch currents) the element adds.
    pub(crate) fn branch_count(&self) -> usize {
        match self {
            Self::VoltageSource { .. } | Self::Inductor { .. } | Self::LinearRegulator { .. } => 1,
            _ => 0,
        }
    }

    pub(crate) fn internal_node_count(&self) -> usize {
        match self {
            Self::Diode {
                series_resistance, ..
            } if *series_resistance > 0.0 => 1,
            _ => 0,
        }
    }
}

/// Result of a DC operating-point analysis.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DcSolution {
    pub node_voltages: std::collections::BTreeMap<String, f64>,
    /// Current flowing into each element's first pin, in amperes.
    pub branch_currents: std::collections::BTreeMap<String, f64>,
    /// Current into every pin of each element, in pin order.
    pub pin_currents: std::collections::BTreeMap<String, Vec<f64>>,
    /// Power absorbed by each element, in watts. Sources delivering power are negative.
    pub component_power: std::collections::BTreeMap<String, f64>,
    pub iterations: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, thiserror::Error)]
#[serde(
    tag = "code",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SolveError {
    #[error("element {element_id} has {actual} pins connected but needs {expected}")]
    PinCount {
        element_id: String,
        expected: usize,
        actual: usize,
    },
    #[error("element {element_id} has an invalid value: {reason}")]
    InvalidValue { element_id: String, reason: String },
    #[error("the circuit has no unique solution (for example, a loop of voltage sources)")]
    Singular,
    #[error("the solution did not converge after {iterations} iterations")]
    NoConvergence { iterations: usize },
}
