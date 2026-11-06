import type { ComponentSpec, Interface, PowerConnector, SpecValue } from "@echidna/core";

import { check, type FitCheck, type SlotFit } from "./slots";
import { checkPhone, phoneChecksFor } from "./phone";
import { checkDrone, droneChecksFor } from "./drone";
import defaults from "../rules.json";
import { grade } from "./engine";

type Thresholds = { warnAt: number; failAbove: number };

export const moduleThresholds = defaults.modules as Record<
  "psuBudget" | "chargerBudget" | "cooling",
  Thresholds
>;

const roleOf = (spec: ComponentSpec) => spec.module?.role;

/** What powers a build: a desktop's PSU or a laptop's charger. */
const isSupply = (spec: ComponentSpec) => roleOf(spec) === "psu" || roleOf(spec) === "charger";

/**
 * The heat a build's cooler has to remove: a desktop CPU's, or the processors soldered onto a laptop's board.
 * @param build - The motherboard and everything plugged into it.
 * @returns The heat, or undefined when nothing in the build gives one.
 */
const heatOf = (build: readonly ComponentSpec[]) =>
  build.find((m) => roleOf(m) === "cpu")?.module?.power ??
  build.find((m) => m.module?.heat)?.module?.heat;

/**
 * The device-level checks of a build. A drone's are `checkDrone`'s, a phone's or wearable's `checkPhone`'s. A desktop's or
 * laptop's are the PSU's or charger's output against everything it powers at full load, the PSU's connectors against
 * what the motherboard and cards need, and the cooler against the processors' heat. A check is left out when the build lacks a part it compares, such as a PSU before one is plugged
 * in. A charger short of the load only warns until it is far short, as the battery makes up the difference for a
 * while.
 * @param host - The motherboard, a drone's frame, or a phone's or wearable's logic board.
 * @param modules - Everything plugged into it.
 * @returns The checks, one per PSU connector needed, or one per PMIC rail in use.
 */
export const checkBuild = (host: ComponentSpec, modules: readonly ComponentSpec[]): FitCheck[] => {
  if (roleOf(host) === "frame") return checkDrone(host, modules);
  if (roleOf(host) === "logicBoard") return checkPhone(host, modules);
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
      for (const [connector, n] of Object.entries(m.module?.needs ?? {}) as [
        PowerConnector,
        number,
      ][]) {
        needed[connector] = (needed[connector] ?? 0) + n;
      }
    }
    for (const [connector, n] of Object.entries(needed) as [PowerConnector, number][]) {
      const offered = psu.provides?.[connector] ?? 0;
      checks.push(
        check("powerConnectors", n > offered ? "fail" : "pass", [], {
          actual: n,
          limit: offered,
          connector,
        }),
      );
    }
  }

  const heat = heatOf(build);
  const cooler = build.find((m) => roleOf(m) === "cooler")?.module?.cooling;
  if (heat && cooler) {
    checks.push(
      check(
        "cooling",
        grade(heat.value / cooler.value, moduleThresholds.cooling),
        [heat, cooler] as SpecValue[],
        {
          actual: heat.value,
          limit: cooler.value,
          unit: "W",
        },
      ),
    );
  }
  return checks;
};

/**
 * How an interface is named in an interface check: its protocol, and the device its connector is made for when it has
 * one, as `protocol@connector`.
 */
export const interfaceKey = (i: Interface): string =>
  i.connector ? `${i.protocol}@${i.connector}` : i.protocol;

/** Whether a part's interface goes in a slot: the same protocol, on the connector the slot has, if it names one. */
const mates = (slot: Interface, part: Interface) =>
  slot.protocol === part.protocol && (!slot.connector || slot.connector === part.connector);

/**
 * Checks whether a module can go in one of a motherboard's slots: whether the slot takes its socket or interface,
 * and the build checks it bears on once it is in. On a drone, those are the `droneChecksFor` its role; on a phone or
 * wearable, the PMIC rail it draws from, or every rail for a PMIC. A slot whose interface names a connector, such as
 * a phone's display connector, takes only parts made for that connector. Power drawn counts against the PSU, a part needing PSU connectors
 * is checked for them (only the worst connector is reported), and a CPU or cooler is checked against the other.
 * @param host - The motherboard, a drone's frame, or a logic board.
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
  const accepts = slot?.accepts.map(interfaceKey) ?? [];
  const protocols = part.interfaces.map(interfaceKey);
  const shared = part.interfaces.some((i) => slot?.accepts.some((a) => mates(a, i)));
  const checks: FitCheck[] = [
    check("interface", slot && role && shared ? "pass" : "fail", [], { protocols, accepts }),
  ];

  if (slot && role && shared && roleOf(host) === "frame") {
    const relevant = droneChecksFor[role] ?? [];
    checks.push(...checkDrone(host, [...others, part]).filter((c) => relevant.includes(c.id)));
  } else if (slot && role && shared && roleOf(host) === "logicBoard") {
    checks.push(...phoneChecksFor(part, checkPhone(host, [...others, part])));
  } else if (slot && role && shared) {
    const build = checkBuild(host, [...others, part]);
    const isPsu = role === "psu";
    const budget = build.find((c) => c.id === "psuBudget" || c.id === "chargerBudget");
    if (budget && (isSupply(part) || part.module?.power)) checks.push(budget);

    const connectors = build.filter(
      (c) =>
        c.id === "powerConnectors" && c.connector && (isPsu || part.module?.needs?.[c.connector]),
    );
    const worst = connectors.find((c) => c.severity === "fail") ?? connectors[0];
    if (worst) checks.push(worst);

    const cooling = build.find((c) => c.id === "cooling");
    if (cooling && (role === "cpu" || role === "cooler")) checks.push(cooling);
  }

  return { fits: checks.every((c) => c.severity !== "fail"), checks };
};

/** A laptop's, phone's or wearable's estimated time on battery in light use, and what it is worked out from. */
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
 * Estimates how long a laptop, phone or wearable runs on battery in light everyday use, such as watching video on a
 * phone: the battery's energy over what the board and every part draw in that use.
 * @param host - The laptop's board.
 * @param modules - Everything plugged into it.
 * @returns The estimate, or null without a battery or anything drawing from it.
 */
export const batteryRuntime = (
  host: ComponentSpec,
  modules: readonly ComponentSpec[],
): BatteryRuntime | null => {
  // A drone's time in the air is `flightTime`'s.
  if (roleOf(host) === "frame") return null;
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
