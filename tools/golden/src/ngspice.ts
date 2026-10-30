import { execFileSync, spawnSync } from "node:child_process";

/**
 * The ngspice command, split into program and leading arguments. Defaults to `ngspice` on the PATH; set
 * `NGSPICE` to run it another way, such as `wsl.exe -d Ubuntu-24.04 ngspice` on Windows.
 */
const command = (): [string, string[]] => {
  const [program = "ngspice", ...args] = (process.env.NGSPICE ?? "ngspice").split(/\s+/).filter(Boolean);
  return [program, args];
};

/** Whether ngspice can be started. */
export const ngspiceAvailable = (): boolean => {
  const [program, args] = command();
  return spawnSync(program, [...args, "--version"], { encoding: "utf8" }).status === 0;
};

/**
 * Runs a deck through ngspice in batch mode, feeding it on standard input so the path never needs translating.
 * @param netlist - Complete SPICE deck.
 * @returns ngspice standard output.
 */
export const runNgspice = (netlist: string): string => {
  const [program, args] = command();
  return execFileSync(program, [...args, "-b"], { input: netlist, encoding: "utf8", timeout: 30_000 });
};
