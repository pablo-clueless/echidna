//! Modified Nodal Analysis solver. DC operating point, transient and AC analyses land in later phases.

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
