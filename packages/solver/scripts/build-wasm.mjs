import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = fileURLToPath(new URL("../wasm/", import.meta.url));
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit" });
const available = (command) => !spawnSync(command, ["--version"], { stdio: "ignore" }).error;

// Hosts without a Rust toolchain (e.g. Vercel) use the committed prebuilt bindings in wasm/.
if (!available("cargo") || !available("wasm-bindgen")) {
  const prebuilt = ["solver.js", "solver_bg.wasm"].every((file) => existsSync(`${out}${file}`));
  if (!prebuilt) {
    console.error("cargo/wasm-bindgen not found and no prebuilt solver in packages/solver/wasm/.");
    process.exit(1);
  }
  console.warn("cargo/wasm-bindgen not found; using prebuilt solver bindings in packages/solver/wasm/.");
  process.exit(0);
}

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
