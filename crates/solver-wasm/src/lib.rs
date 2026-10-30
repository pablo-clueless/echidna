use serde::Serialize;
use wasm_bindgen::prelude::*;

/// Returns the version of the bundled solver.
#[wasm_bindgen(js_name = solverVersion)]
pub fn solver_version() -> String {
    echidna_solver::version().to_owned()
}

/// Solves the DC operating point of a circuit given as a plain object (`{ ground, elements }`).
/// Throws a `{ code, ... }` object on failure so the UI can show a translated message.
#[wasm_bindgen(js_name = solveDc)]
pub fn solve_dc(circuit: JsValue) -> Result<JsValue, JsValue> {
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    let circuit: echidna_solver::Circuit =
        serde_wasm_bindgen::from_value(circuit).map_err(|e| JsValue::from_str(&e.to_string()))?;
    match echidna_solver::solve_dc(&circuit) {
        Ok(solution) => solution.serialize(&serializer).map_err(Into::into),
        Err(error) => Err(error.serialize(&serializer)?),
    }
}

/// Simulates a circuit from switch-on. `options` is `{ stopTime, timeStep }` in seconds. Throws a `{ code, ... }`
/// object on failure, as `solveDc` does.
#[wasm_bindgen(js_name = solveTransient)]
pub fn solve_transient(circuit: JsValue, options: JsValue) -> Result<JsValue, JsValue> {
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    let circuit: echidna_solver::Circuit =
        serde_wasm_bindgen::from_value(circuit).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let options: echidna_solver::TransientOptions =
        serde_wasm_bindgen::from_value(options).map_err(|e| JsValue::from_str(&e.to_string()))?;
    match echidna_solver::solve_transient(&circuit, &options) {
        Ok(solution) => solution.serialize(&serializer).map_err(Into::into),
        Err(error) => Err(error.serialize(&serializer)?),
    }
}
