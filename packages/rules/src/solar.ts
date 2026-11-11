import type { ComponentSpec, ModuleRole, ModuleSpec } from "@echidna/core";

import { check, type FitCheck, type FitCheckId } from "./slots";
import type { BatteryRuntime } from "./modules";
import defaults from "../rules.json";
import { grade } from "./engine";

type Thresholds = { warnAt: number; failAbove: number };

export const solarThresholds = defaults.solar as Record<
  "pvVoltage" | "pvPower" | "inverterLoad" | "inverterSurge" | "batteryCurrent",
  Thresholds
>;

/**
 * The coldest morning a PV array is checked for, in kelvin. A panel's open-circuit voltage rises as it gets colder,
 * so a string that is safe at 25 °C can exceed the charge controller's limit on a frosty sunrise.
 */
export const DESIGN_LOW_TEMPERATURE: number = defaults.solarDesignLowTemperature;

/** Standard test conditions: the cell temperature panel ratings are given at, in kelvin. */
const STC_TEMPERATURE = 298.15;

const moduleOf = (build: readonly ComponentSpec[], role: ModuleRole): ModuleSpec | undefined =>
  build.find((m) => m.module?.role === role)?.module;

/**
 * A PV string's open-circuit voltage on the coldest morning it is designed for.
 * @param array - The PV array.
 * @returns Volts, or undefined when the array gives no open-circuit voltage.
 */
export const coldOpenCircuitVoltage = (array: ModuleSpec): number | undefined => {
  const voc = array.openCircuitVoltage?.value;
  if (voc === undefined) return undefined;
  const coefficient = array.voltageTempCoefficient?.value ?? 0;
  return voc * (1 + coefficient * Math.max(0, STC_TEMPERATURE - DESIGN_LOW_TEMPERATURE));
};

/**
 * The device-level checks of a solar system, with a hybrid inverter as its host: whether the PV string's cold
 * open-circuit voltage stays under the charge controller's limit, whether the array's power is within what the
 * controller can use, whether the AC loads are within the inverter's continuous and surge ratings, and whether the
 * battery's BMS allows the current the inverter draws from it at full load. A check is left out when the system
 * lacks a part it compares, such as a battery.
 * @param inverter - The hybrid inverter, the system's host.
 * @param modules - Everything connected to it.
 * @returns The checks that apply.
 */
export const checkSolar = (
  inverter: ComponentSpec,
  modules: readonly ComponentSpec[],
): FitCheck[] => {
  const host = inverter.module;
  const array = moduleOf(modules, "pvArray");
  const battery = moduleOf(modules, "battery");
  const loads = modules.filter((m) => m.module?.role === "acLoad").flatMap((m) => m.module ?? []);
  const checks: FitCheck[] = [];
  if (!host) return checks;

  const cold = array ? coldOpenCircuitVoltage(array) : undefined;
  if (array?.openCircuitVoltage && cold !== undefined && host.maxPvVoltage) {
    checks.push(
      check(
        "pvVoltage",
        grade(cold / host.maxPvVoltage.value, solarThresholds.pvVoltage),
        [array.openCircuitVoltage, array.voltageTempCoefficient, host.maxPvVoltage],
        { actual: cold, limit: host.maxPvVoltage.value, unit: "V" },
      ),
    );
  }

  if (array?.output && host.maxPvPower) {
    checks.push(
      check(
        "pvPower",
        grade(array.output.value / host.maxPvPower.value, solarThresholds.pvPower),
        [array.output, host.maxPvPower],
        { actual: array.output.value, limit: host.maxPvPower.value, unit: "W" },
      ),
    );
  }

  const running = loads.flatMap((l) => l.power ?? []);
  const load = running.reduce((sum, p) => sum + p.value, 0);
  if (running.length > 0 && host.output) {
    checks.push(
      check(
        "inverterLoad",
        grade(load / host.output.value, solarThresholds.inverterLoad),
        [...running, host.output],
        { actual: load, limit: host.output.value, unit: "W" },
      ),
    );
  }

  const starting = loads.flatMap((l) => l.startup ?? l.power ?? []);
  const startup = starting.reduce((sum, p) => sum + p.value, 0);
  if (starting.length > 0 && host.surge) {
    checks.push(
      check(
        "inverterSurge",
        grade(startup / host.surge.value, solarThresholds.inverterSurge),
        [...starting, host.surge],
        { actual: startup, limit: host.surge.value, unit: "W" },
      ),
    );
  }

  if (running.length > 0 && battery?.voltage && battery.maxCurrent && host.efficiency) {
    const idle = host.typical?.value ?? 0;
    const draw = (load / host.efficiency.value + idle) / battery.voltage.value;
    checks.push(
      check(
        "batteryCurrent",
        grade(draw / battery.maxCurrent.value, solarThresholds.batteryCurrent),
        [...running, host.efficiency, host.typical, battery.voltage, battery.maxCurrent],
        { actual: draw, limit: battery.maxCurrent.value, unit: "A" },
      ),
    );
  }
  return checks;
};

/** The solar checks each kind of part bears on, so a swap shows only the ones it can change. */
export const solarChecksFor: Partial<Record<ModuleRole, readonly FitCheckId[]>> = {
  pvArray: ["pvVoltage", "pvPower"],
  battery: ["batteryCurrent"],
  acLoad: ["inverterLoad", "inverterSurge", "batteryCurrent"],
  monitor: [],
};

/**
 * Estimates how long a solar system's battery runs its AC loads through the night, with no sun: the battery's energy
 * over the loads' average draw, scaled up for the inverter's losses, plus what the inverter and monitor draw idling.
 * @param inverter - The hybrid inverter.
 * @param modules - Everything connected to it.
 * @returns The estimate, or null without a battery or anything drawing from it.
 */
export const solarRuntime = (
  inverter: ComponentSpec,
  modules: readonly ComponentSpec[],
): BatteryRuntime | null => {
  const host = inverter.module;
  const energy = moduleOf(modules, "battery")?.energy;
  if (!host || !energy) return null;
  const efficiency = host.efficiency;
  const ac = modules
    .filter((m) => m.module?.role === "acLoad")
    .flatMap((m) => m.module?.typical ?? []);
  const dc = [
    host,
    ...modules.filter((m) => m.module?.role === "monitor").flatMap((m) => m.module ?? []),
  ].flatMap((m) => m.typical ?? []);
  const acDraw = ac.reduce((sum, p) => sum + p.value, 0) / (efficiency?.value ?? 1);
  const draw = acDraw + dc.reduce((sum, p) => sum + p.value, 0);
  if (draw <= 0) return null;
  return {
    runtime: energy.value / draw,
    energy: energy.value,
    draw,
    estimated: [energy, efficiency, ...ac, ...dc].some((v) => v?.source === "estimated"),
  };
};
