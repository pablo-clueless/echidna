/* tslint:disable */
/* eslint-disable */

/**
 * Sweeps a circuit's small-signal response. `options` is `{ source, startFrequency, stopFrequency, pointsPerDecade }`,
 * with frequencies in hertz. Throws a `{ code, ... }` object on failure, as `solveDc` does.
 */
export function solveAc(circuit: any, options: any): any;

/**
 * Solves the DC operating point of a circuit given as a plain object (`{ ground, elements }`).
 * Throws a `{ code, ... }` object on failure so the UI can show a translated message.
 */
export function solveDc(circuit: any): any;

/**
 * Simulates a circuit from switch-on. `options` is `{ stopTime, timeStep }` in seconds. Throws a `{ code, ... }`
 * object on failure, as `solveDc` does.
 */
export function solveTransient(circuit: any, options: any): any;

/**
 * Returns the version of the bundled solver.
 */
export function solverVersion(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly solveAc: (a: any, b: any) => [number, number, number];
  readonly solveDc: (a: any) => [number, number, number];
  readonly solveTransient: (a: any, b: any) => [number, number, number];
  readonly solverVersion: () => [number, number];
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
  module_or_path?:
    { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>,
): Promise<InitOutput>;
