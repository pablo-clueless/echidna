import {
  anyEstimated,
  type ComponentSpec,
  type HostSlot,
  type PowerConnector,
  type Severity,
  type SpecValue,
  type Unit,
} from "@echidna/core";

import defaults from "../rules.json";
import { grade } from "./engine";

/** The checks a part must pass to go in a slot: the physical / protocol, electrical and thermal checks of §5.2. */
export type FitCheckId =
  | "interface"
  | "supply"
  | "railCurrent"
  | "logicIntoHost"
  | "logicIntoPart"
  | "thermal"
  | "chargerBudget"
  | "psuBudget"
  | "powerConnectors"
  | "cooling"
  | "thrustToWeight"
  | "escCurrent"
  | "batteryDischarge";

/**
 * One check of a part against a slot. `actual` and `limit` are set for the checks that compare two quantities;
 * the supply check gives the part's voltage range as `min` and `limit` and the voltages the slot offers as `offered`.
 */
export type FitCheck = {
  id: FitCheckId;
  severity: Severity;
  estimated: boolean;
  actual?: number;
  limit?: number;
  min?: number;
  unit?: Unit;
  /** The part's protocols, for the interface check. */
  protocols?: string[];
  /** What the slot accepts, for the interface check. */
  accepts?: string[];
  /** The rail voltages the slot offers, for the supply check. */
  offered?: number[];
  /** The rail the part would draw from. */
  railId?: string;
  /** The PSU connector a power connector check counts, `actual` needed against `limit` offered. */
  connector?: PowerConnector;
};

export type SlotFit = {
  /** Whether the part may go in the slot: no check fails. Warnings still fit. */
  fits: boolean;
  /** The rail the part would draw from, if the slot offers one in its supply range. */
  railId?: string;
  checks: FitCheck[];
};

type Thresholds = { warnAt: number; failAbove: number };

export const slotThresholds = defaults.slots as Record<"railCurrent" | "thermal", Thresholds>;

export const check = (
  id: FitCheckId,
  severity: Severity,
  values: ReadonlyArray<SpecValue | undefined>,
  extra: Partial<FitCheck> = {},
): FitCheck => ({
  id,
  severity,
  estimated: anyEstimated(values),
  ...extra,
});

/**
 * Checks whether a part can go in one of a host board's slots: whether the slot carries the part's protocol,
 * offers a rail in the part's supply range with current to spare, whether the signal levels are safe both ways,
 * and whether the part's heat fits the slot's budget.
 * @param host - The host board's spec.
 * @param slotId - The slot on that host.
 * @param part - The part to plug in.
 * @param railLoads - Current already drawn from each of the host's rails by other parts, in amps, by rail ID.
 * @returns Every check with its verdict, and whether the part fits.
 */
export const checkSlotFit = (
  host: ComponentSpec,
  slotId: string,
  part: ComponentSpec,
  railLoads: Readonly<Record<string, number>> = {},
): SlotFit => {
  const slot: HostSlot | undefined = host.host?.slots.find((s) => s.id === slotId);
  const supply = part.supply;
  const accepts = slot?.accepts.map((i) => i.protocol) ?? [];
  const protocols = part.interfaces.map((i) => i.protocol);
  const shared = protocols.some((p) => accepts.includes(p));
  const checks: FitCheck[] = [
    check("interface", slot && supply && shared ? "pass" : "fail", [], { protocols, accepts }),
  ];
  if (!slot || !supply) return { fits: false, checks };

  const rails = (slot.railIds ?? []).flatMap(
    (id) => host.host?.rails.find((r) => r.id === id) ?? [],
  );
  const rail = rails.find(
    (r) =>
      r.voltage.value >= supply.minVoltage.value - 1e-9 &&
      r.voltage.value <= supply.maxVoltage.value + 1e-9,
  );
  checks.push(
    check(
      "supply",
      rail ? "pass" : "fail",
      [supply.minVoltage, supply.maxVoltage, ...rails.map((r) => r.voltage)],
      {
        min: supply.minVoltage.value,
        limit: supply.maxVoltage.value,
        unit: "V",
        offered: rails.map((r) => r.voltage.value),
        ...(rail ? { actual: rail.voltage.value, railId: rail.id } : {}),
      },
    ),
  );

  if (rail) {
    const load = (railLoads[rail.id] ?? 0) + supply.current.value;
    checks.push(
      check(
        "railCurrent",
        grade(load / rail.maxCurrent.value, slotThresholds.railCurrent),
        [supply.current, rail.maxCurrent],
        {
          actual: load,
          limit: rail.maxCurrent.value,
          unit: "A",
          railId: rail.id,
        },
      ),
    );
    const partHigh = supply.logicHigh?.value ?? rail.voltage.value;
    const { logicHigh, maxInput } = slot;
    if (logicHigh && maxInput)
      checks.push(
        check(
          "logicIntoHost",
          partHigh > maxInput.value + 1e-9 ? "fail" : "pass",
          [supply.logicHigh, maxInput],
          {
            actual: partHigh,
            limit: maxInput.value,
            unit: "V",
          },
        ),
        check(
          "logicIntoPart",
          logicHigh.value > supply.maxInput.value + 1e-9 ? "fail" : "pass",
          [logicHigh, supply.maxInput],
          {
            actual: logicHigh.value,
            limit: supply.maxInput.value,
            unit: "V",
          },
        ),
      );
    if (slot.thermalBudget) {
      const heat = rail.voltage.value * supply.current.value;
      checks.push(
        check(
          "thermal",
          grade(heat / slot.thermalBudget.value, slotThresholds.thermal),
          [supply.current, slot.thermalBudget],
          {
            actual: heat,
            limit: slot.thermalBudget.value,
            unit: "W",
          },
        ),
      );
    }
  }

  return {
    fits: checks.every((c) => c.severity !== "fail"),
    ...(rail ? { railId: rail.id } : {}),
    checks,
  };
};
