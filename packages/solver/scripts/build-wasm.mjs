import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = fileURLToPath(new URL("../wasm/", import.meta.url));
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit" });

run("cargo", ["build", "-p", "echidna-solver-wasm", "--target", "wasm32-unknown-unknown", "--release"]);
run("wasm-bindgen", [
  "--target",
  "web",
  "--out-dir",
  out,
  "--out-name",
  "solver",
  `${root}target/wasm32-unknown-unknown/release/echidna_solver_wasm.wasm`,
]);
