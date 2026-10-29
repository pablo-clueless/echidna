use wasm_bindgen::prelude::*;

/// Returns the version of the bundled solver.
#[wasm_bindgen(js_name = solverVersion)]
pub fn solver_version() -> String {
    echidna_solver::version().to_owned()
}
