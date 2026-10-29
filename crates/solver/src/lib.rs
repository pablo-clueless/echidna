//! Modified Nodal Analysis circuit solver. DC operating point lands in Phase 1; transient and AC follow.

mod circuit;
mod dc;
mod matrix;

pub use circuit::{Circuit, DcSolution, Element, ElementKind, SolveError, THERMAL_VOLTAGE};
pub use dc::solve_dc;

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
