//! Modified Nodal Analysis circuit solver: DC operating point, transient and AC small-signal analysis.

mod ac;
mod circuit;
mod dc;
mod devices;
mod matrix;
mod transient;

pub use ac::{MAX_AC_POINTS, solve_ac};
pub use circuit::{
    AcOptions, AcSolution, BjtPolarity, Channel, Circuit, DcSolution, Element, ElementKind, Phasor,
    SolveError, THERMAL_VOLTAGE, TransientOptions, TransientSolution,
};
pub use dc::solve_dc;
pub use transient::{MAX_TIME_STEPS, solve_transient};

/// Returns the crate version, used by the WASM wrapper and API to report which solver build is running.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_version() {
        assert_eq!(version(), "0.1.0");
    }
}
