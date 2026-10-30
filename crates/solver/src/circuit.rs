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
    /// Pins: a, b. Conducts through its `contact_resistance` while `closed` is 1; an ideal open circuit while it
    /// is 0, so no current flows at all.
    Switch {
        contact_resistance: f64,
        #[serde(default = "unity")]
        closed: f64,
    },
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
    /// Pins: collector, base, emitter. Ebers–Moll transport model with the forward Early effect, which is SPICE
    /// Gummel–Poon with its high-injection, leakage, resistance and charge parameters left at their defaults.
    Bjt {
        polarity: BjtPolarity,
        saturation_current: f64,
        forward_beta: f64,
        #[serde(default = "unity")]
        reverse_beta: f64,
        /// Forward Early voltage `VAF`. Zero leaves the effect out, as in SPICE.
        #[serde(default)]
        early_voltage: f64,
    },
    /// Pins: drain, gate, source, with the body tied to the source. Shichman–Hodges (SPICE level 1) model
    /// without body effect or junction diodes.
    Mosfet {
        channel: Channel,
        /// `VTO` in the SPICE sign convention, so negative for an enhancement-mode p-channel part.
        threshold_voltage: f64,
        /// `KP·W/L`, in A/V².
        transconductance: f64,
        /// `LAMBDA`, in 1/V.
        #[serde(default)]
        channel_length_modulation: f64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BjtPolarity {
    Npn,
    Pnp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Channel {
    N,
    P,
}

impl BjtPolarity {
    /// `+1` for NPN and `−1` for PNP, so one set of equations covers both.
    pub(crate) fn sign(self) -> f64 {
        match self {
            Self::Npn => 1.0,
            Self::Pnp => -1.0,
        }
    }
}

impl Channel {
    /// `+1` for n-channel and `−1` for p-channel, so one set of equations covers both.
    pub(crate) fn sign(self) -> f64 {
        match self {
            Self::N => 1.0,
            Self::P => -1.0,
        }
    }
}

const fn unity() -> f64 {
    1.0
}

impl ElementKind {
    pub(crate) fn pin_count(&self) -> usize {
        match self {
            Self::LinearRegulator { .. } | Self::Bjt { .. } | Self::Mosfet { .. } => 3,
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

/// Settings for a transient analysis.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransientOptions {
    /// How long to simulate, in seconds.
    pub stop_time: f64,
    /// Longest time step, in seconds. The run takes equal steps no longer than this that end exactly at `stop_time`.
    pub time_step: f64,
}

/// Result of a transient analysis, one entry per time step. Series are sampled at `times`, which start one step
/// after switch-on and end at the stop time.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransientSolution {
    pub times: Vec<f64>,
    pub node_voltages: std::collections::BTreeMap<String, Vec<f64>>,
    /// Current into every pin of each element, in pin order, each a series over `times`.
    pub pin_currents: std::collections::BTreeMap<String, Vec<Vec<f64>>>,
    /// Power absorbed by each element over `times`, in watts. Sources delivering power are negative.
    pub component_power: std::collections::BTreeMap<String, Vec<f64>>,
    /// Newton–Raphson iterations across all steps.
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
    #[error("the analysis settings are invalid: {reason}")]
    InvalidAnalysis { reason: String },
}
