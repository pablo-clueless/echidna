import type { ComponentSpec, ModuleRole, ModuleSpec, SpecValue } from "@echidna/core";

import { check, type FitCheck, type FitCheckId } from "./slots";
import defaults from "../rules.json";
import { grade } from "./engine";

type Thresholds = { warnAt: number; failAbove: number };

export const droneThresholds = defaults.drone as Record<
  "thrustToWeight" | "escCurrent" | "batteryDischarge",
  Thresholds
>;

/** Standard gravity, in m/s². */
export const GRAVITY = 9.80665;

/** Density of air at sea level and 15 °C, in kg/m³. */
export const AIR_DENSITY = 1.225;

/** Seconds in an hour, and so coulombs in an amp-hour. */
const HOUR = 3600;

/** Newtons to grams-force, the unit hobbyists weigh drones and rate thrust in. */
const grams = (newtons: number) => (newtons / GRAVITY) * 1000;

type Drone = {
  frame: ComponentSpec;
  build: ComponentSpec[];
  rotors: number;
  motors: ModuleSpec | undefined;
  propellers: ModuleSpec | undefined;
  battery: ModuleSpec | undefined;
  /** What each motor's ESC channel is rated for: a separate ESC's, or the frame's when it has them built in. */
  escRating: SpecValue | undefined;
};

const moduleOf = (build: readonly ComponentSpec[], role: ModuleRole) =>
  build.find((m) => m.module?.role === role)?.module;

const droneOf = (frame: ComponentSpec, modules: readonly ComponentSpec[]): Drone => {
  const build = [frame, ...modules];
  return {
    frame,
    build,
    rotors: frame.module?.rotors ?? 4,
    motors: moduleOf(build, "motors"),
    propellers: moduleOf(build, "propellers"),
    battery: moduleOf(build, "battery"),
    escRating: moduleOf(modules, "esc")?.maxCurrent ?? frame.module?.maxCurrent,
  };
};

/** Every mass in the build, so the total weight can be summed and its provenance checked. */
const massesOf = (build: readonly ComponentSpec[]) => build.flatMap((m) => m.module?.mass ?? []);

/**
 * The device-level checks of a drone: whether the motors lift its weight with enough to spare, whether each motor's
 * full-throttle current is within its ESC's rating, and whether the battery can supply every motor at full throttle
 * within its C-rating. A check is left out when the build lacks a part it compares, such as a battery.
 * @param frame - The drone's frame, its host.
 * @param modules - Everything plugged into it.
 * @returns The checks that apply.
 */
export const checkDrone = (frame: ComponentSpec, modules: readonly ComponentSpec[]): FitCheck[] => {
  const drone = droneOf(frame, modules);
  const { motors, battery, rotors, escRating } = drone;
  const checks: FitCheck[] = [];

  if (motors?.thrust) {
    const masses = massesOf(drone.build);
    const weight = masses.reduce((sum, m) => sum + m.value, 0) * GRAVITY;
    const thrust = motors.thrust.value * rotors;
    checks.push(
      check(
        "thrustToWeight",
        grade(weight / thrust, droneThresholds.thrustToWeight),
        [...masses, motors.thrust],
        { actual: grams(weight), limit: grams(thrust), unit: "g" },
      ),
    );
  }

  if (motors?.current && escRating) {
    checks.push(
      check(
        "escCurrent",
        grade(motors.current.value / escRating.value, droneThresholds.escCurrent),
        [motors.current, escRating],
        { actual: motors.current.value, limit: escRating.value, unit: "A" },
      ),
    );
  }

  if (motors?.current && battery?.capacity && battery.cRating) {
    const draw = motors.current.value * rotors;
    const limit = (battery.capacity.value / HOUR) * battery.cRating.value;
    checks.push(
      check(
        "batteryDischarge",
        grade(draw / limit, droneThresholds.batteryDischarge),
        [motors.current, battery.capacity, battery.cRating],
        { actual: draw, limit, unit: "A" },
      ),
    );
  }
  return checks;
};

/** The drone checks each kind of part bears on, so a swap shows only the ones it can change. */
export const droneChecksFor: Partial<Record<ModuleRole, readonly FitCheckId[]>> = {
  motors: ["thrustToWeight", "escCurrent", "batteryDischarge"],
  esc: ["escCurrent"],
  battery: ["thrustToWeight", "batteryDischarge"],
  propellers: ["thrustToWeight"],
  flightController: ["thrustToWeight"],
  camera: ["thrustToWeight"],
};

/** A drone's estimated hover time, and what it is worked out from. */
export type FlightTime = {
  /** Seconds, hovering in still air until the battery is flat. */
  time: number;
  /** Stored energy, in joules. */
  energy: number;
  /** Power drawn in a hover, in watts. */
  power: number;
  /** All-up weight, in grams. */
  weight: number;
  estimated: boolean;
};

/**
 * Estimates how long a drone hovers on one battery. Momentum theory gives the least power a rotor of area A needs to
 * hold up a thrust T in air of density ρ, √(T³ / 2ρA); the motors' hover efficiency scales that up to the electrical
 * power drawn, and the frame, flight controller and camera add what they draw. The battery's energy over the total
 * is the time. Flying forward slowly takes a little less power than hovering, so makers' figures, measured that
 * way, can run a few minutes longer.
 * @param frame - The drone's frame.
 * @param modules - Everything plugged into it.
 * @returns The estimate, or null without a battery, motors or propellers, or when the motors can't lift it.
 */
export const flightTime = (
  frame: ComponentSpec,
  modules: readonly ComponentSpec[],
): FlightTime | null => {
  if (frame.module?.role !== "frame") return null;
  const drone = droneOf(frame, modules);
  const { motors, propellers, battery, rotors } = drone;
  const energy = battery?.energy;
  const efficiency = motors?.efficiency;
  const diameter = propellers?.diameter;
  if (!energy || !efficiency || !diameter || !motors?.thrust) return null;

  const masses = massesOf(drone.build);
  const weight = masses.reduce((sum, m) => sum + m.value, 0) * GRAVITY;
  const perRotor = weight / rotors;
  if (perRotor > motors.thrust.value) return null;

  const area = Math.PI * (diameter.value / 2) ** 2;
  const induced = rotors * Math.sqrt(perRotor ** 3 / (2 * AIR_DENSITY * area));
  const draws = drone.build.flatMap((m) => m.module?.typical ?? []);
  const power = induced / efficiency.value + draws.reduce((sum, p) => sum + p.value, 0);
  return {
    time: energy.value / power,
    energy: energy.value,
    power,
    weight: grams(weight),
    estimated: [energy, efficiency, diameter, ...masses, ...draws].some(
      (v) => v.source === "estimated",
    ),
  };
};
