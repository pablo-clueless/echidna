import type { ComponentSpec, PowerConnector, SpecValue } from "@echidna/core";

import { check, type FitCheck, type SlotFit } from "./slots";
import defaults from "../rules.json";
import { grade } from "./engine";

type Thresholds = { warnAt: number; failAbove: number };

export const moduleThresholds = defaults.modules as Record<"psuBudget" | "chargerBudget" | "cooling", Thresholds>;

const roleOf = (spec: ComponentSpec) => spec.module?.role;

/** What powers a build: a desktop's PSU or a laptop's charger. */
const isSupply = (spec: ComponentSpec) => roleOf(spec) === "psu" || roleOf(spec) === "charger";

/**
 * The heat a build's cooler has to remove: a desktop CPU's, or the processors soldered onto a laptop's board.
 * @param build - The motherboard and everything plugged into it.
 * @returns The heat, or undefined when nothing in the build gives one.
 */
const heatOf = (build: readonly ComponentSpec[]) =>
  build.find((m) => roleOf(m) === "cpu")?.module?.power ?? build.find((m) => m.module?.heat)?.module?.heat;

/**
 * The device-level checks of a desktop or laptop build: the PSU's or charger's output against everything it powers
 * at full load, the PSU's connectors against what the motherboard and cards need, and the cooler against the
 * processors' heat. A check is left out when the build lacks a part it compares, such as a PSU before one is plugged
 * in. A charger short of the load only warns until it is far short, as the battery makes up the difference for a
 * while.
 * @param host - The motherboard.
 * @param modules - Everything plugged into it.
 * @returns The checks, one per PSU connector needed.
 */
export const checkBuild = (host: ComponentSpec, modules: readonly ComponentSpec[]): FitCheck[] => {
  const build = [host, ...modules];
  const checks: FitCheck[] = [];
  const supply = build.find(isSupply);
  const psu = supply?.module?.role === "psu" ? supply.module : undefined;
  const loads = build.filter((m) => !isSupply(m));

  if (supply?.module?.output) {
    const id = supply.module.role === "psu" ? "psuBudget" : "chargerBudget";
    const output = supply.module.output;
    const powers = loads.flatMap((m) => m.module?.power ?? []);
    const load = powers.reduce((sum, p) => sum + p.value, 0);
    checks.push(
      check(id, grade(load / output.value, moduleThresholds[id]), [...powers, output], {
        actual: load,
        limit: output.value,
        unit: "W",
      }),
    );
  }

  if (psu) {
    const needed: Partial<Record<PowerConnector, number>> = {};
    for (const m of loads) {
      for (const [connector, n] of Object.entries(m.module?.needs ?? {}) as [PowerConnector, number][]) {
        needed[connector] = (needed[connector] ?? 0) + n;
      }
    }
    for (const [connector, n] of Object.entries(needed) as [PowerConnector, number][]) {
      const offered = psu.provides?.[connector] ?? 0;
      checks.push(check("powerConnectors", n > offered ? "fail" : "pass", [], { actual: n, limit: offered, connector }));
    }
  }

  const heat = heatOf(build);
  const cooler = build.find((m) => roleOf(m) === "cooler")?.module?.cooling;
  if (heat && cooler) {
    checks.push(
      check("cooling", grade(heat.value / cooler.value, moduleThresholds.cooling), [heat, cooler] as SpecValue[], {
        actual: heat.value,
        limit: cooler.value,
        unit: "W",
      }),
    );
  }
  return checks;
};

/**
 * Checks whether a module can go in one of a motherboard's slots: whether the slot takes its socket or interface,
 * and the build checks it bears on once it is in. Power drawn counts against the PSU, a part needing PSU connectors
 * is checked for them (only the worst connector is reported), and a CPU or cooler is checked against the other.
 * @param host - The motherboard.
 * @param slotId - The slot on it.
 * @param part - The module to plug in.
 * @param others - What else is plugged into the motherboard, not counting anything the part would replace.
 * @returns Every check with its verdict, and whether the module fits.
 */
export const checkModuleFit = (
  host: ComponentSpec,
  slotId: string,
  part: ComponentSpec,
  others: readonly ComponentSpec[] = [],
): SlotFit => {
  const slot = host.host?.slots.find((s) => s.id === slotId);
  const role = roleOf(part);
  const accepts = slot?.accepts.map((i) => i.protocol) ?? [];
  const protocols = part.interfaces.map((i) => i.protocol);
  const shared = protocols.some((p) => accepts.includes(p));
  const checks: FitCheck[] = [check("interface", slot && role && shared ? "pass" : "fail", [], { protocols, accepts })];

  if (slot && role && shared) {
    const build = checkBuild(host, [...others, part]);
    const isPsu = role === "psu";
    const budget = build.find((c) => c.id === "psuBudget" || c.id === "chargerBudget");
    if (budget && (isSupply(part) || part.module?.power)) checks.push(budget);

    const connectors = build.filter(
      (c) => c.id === "powerConnectors" && c.connector && (isPsu || part.module?.needs?.[c.connector]),
    );
    const worst = connectors.find((c) => c.severity === "fail") ?? connectors[0];
    if (worst) checks.push(worst);

    const cooling = build.find((c) => c.id === "cooling");
    if (cooling && (role === "cpu" || role === "cooler")) checks.push(cooling);
  }

  return { fits: checks.every((c) => c.severity !== "fail"), checks };
};

/** A laptop's estimated time on battery in light use, and what it is worked out from. */
export type BatteryRuntime = {
  /** Seconds. */
  runtime: number;
  /** Stored energy, in joules. */
  energy: number;
  /** Power drawn in light use, in watts. */
  draw: number;
  estimated: boolean;
};

/**
 * Estimates how long a laptop runs on battery in light everyday use: the battery's energy over what the board and
 * every part draw in light use.
 * @param host - The laptop's board.
 * @param modules - Everything plugged into it.
 * @returns The estimate, or null without a battery or anything drawing from it.
 */
export const batteryRuntime = (host: ComponentSpec, modules: readonly ComponentSpec[]): BatteryRuntime | null => {
  const build = [host, ...modules];
  const energy = build.find((m) => roleOf(m) === "battery")?.module?.energy;
  const draws = build.flatMap((m) => m.module?.typical ?? []);
  const draw = draws.reduce((sum, p) => sum + p.value, 0);
  if (!energy || draw <= 0) return null;
  return {
    runtime: energy.value / draw,
    energy: energy.value,
    draw,
    estimated: [energy, ...draws].some((v) => v.source === "estimated"),
  };
};
