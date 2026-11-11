import type { ComponentSpec, PinRef } from "@echidna/core";

import { deriveNets, type ProjectData } from "@/lib/project/model";

/** One pin on a net, named for people: the part's designator and the pin's name, such as `B1 GPIO21 SDA`. */
export type PinLabel = { componentId: string; pinId: string; pin: string; part: string };

/** One net of the wiring table: its name and every pin on it. */
export type NetRow = { net: string; pins: PinLabel[] };

/** One connection of a part plugged into a host board's slot: which host pin each of its pins goes to. */
export type SlotRow = {
  partId: string;
  part: string;
  hostId: string;
  slotId: string;
  /** The part's pin. */
  pin: string;
  /** The host pin it is wired to. */
  hostPin: string;
  /** What the connection carries: the rail it draws from, ground, or a signal such as `SDA`. */
  signal: string;
};

export type Pinout = { nets: NetRow[]; slots: SlotRow[] };

type Project = Pick<ProjectData, "components" | "wires" | "slots">;

const label = (
  project: Project,
  specs: ReadonlyMap<string, ComponentSpec>,
  ref: PinRef,
): PinLabel => {
  const spec = specs.get(project.components.find((c) => c.id === ref.componentId)?.specId ?? "");
  return {
    componentId: ref.componentId,
    pinId: ref.pinId,
    pin: spec?.pins.find((p) => p.id === ref.pinId)?.name ?? ref.pinId,
    part: spec?.name ?? ref.componentId,
  };
};

/**
 * The project's wiring as tables: every net with the pins on it, named after a ground or rail pin where it has one
 * (`GND`, `B1 3V3`) and otherwise after its first pin; and, for each part plugged into a host board, which host pin
 * each of its pins goes to.
 * @param project - The open project.
 * @param specs - Part lookup by spec ID.
 * @returns Nets in designator order, and slot connections by part.
 */
export const projectPinout = (
  project: Project,
  specs: ReadonlyMap<string, ComponentSpec>,
): Pinout => {
  const specOf = (id: string) =>
    specs.get(project.components.find((c) => c.id === id)?.specId ?? "");
  const groundPin = (p: PinRef) => {
    const spec = specOf(p.componentId);
    return spec?.model === "ground" || spec?.host?.groundPinId === p.pinId;
  };
  const railPin = (p: PinRef) =>
    specOf(p.componentId)?.host?.rails.find((r) => r.pinId === p.pinId);

  const byDesignator = (a: PinLabel, b: PinLabel) =>
    a.componentId.localeCompare(b.componentId, "en", { numeric: true }) ||
    a.pin.localeCompare(b.pin, "en", { numeric: true });

  const nets = deriveNets(project.wires).map((net) => {
    const pins = net.pins.map((p) => label(project, specs, p)).sort(byDesignator);
    const rail = net.pins.find(railPin);
    const name = net.pins.some(groundPin)
      ? "GND"
      : rail
        ? `${rail.componentId} ${label(project, specs, rail).pin}`
        : `${pins[0]?.componentId ?? ""}.${pins[0]?.pin ?? ""}`;
    return { net: name, pins };
  });
  // Several separate nets can touch ground pins on different parts; number any repeated names.
  const seen = new Map<string, number>();
  for (const row of nets) {
    const count = (seen.get(row.net) ?? 0) + 1;
    seen.set(row.net, count);
    if (count > 1) row.net = `${row.net} (${count})`;
  }
  nets.sort((a, b) =>
    a.net === "GND"
      ? -1
      : b.net === "GND"
        ? 1
        : a.net.localeCompare(b.net, "en", { numeric: true }),
  );

  const slots: SlotRow[] = [];
  for (const [partId, at] of Object.entries(project.slots)) {
    const part = specOf(partId);
    const host = specOf(at.hostId);
    const slot = host?.host?.slots.find((s) => s.id === at.slotId);
    if (!part?.supply || !host?.host || !slot) continue;
    const pinName = (spec: ComponentSpec, id: string) =>
      spec.pins.find((p) => p.id === id)?.name ?? id;
    const rail = host.host.rails.find((r) => r.id === at.railId);
    const row = (pin: string, hostPin: string, signal: string): SlotRow => ({
      partId,
      part: part.name,
      hostId: at.hostId,
      slotId: at.slotId,
      pin: pinName(part, pin),
      hostPin: pinName(host, hostPin),
      signal,
    });
    if (rail) slots.push(row(part.supply.pinId, rail.pinId, pinName(host, rail.pinId)));
    if (host.host.groundPinId)
      slots.push(row(part.supply.groundPinId, host.host.groundPinId, "GND"));
    for (const [signal, partPin] of Object.entries(part.supply.signals)) {
      const hostPin = slot.signals?.[signal];
      if (hostPin) slots.push(row(partPin, hostPin, signal));
    }
  }
  slots.sort((a, b) => a.partId.localeCompare(b.partId, "en", { numeric: true }));
  return { nets, slots };
};

const csvCell = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * The wiring table as CSV, one row per pin: net, part designator, part name, pin; then the slot connections.
 * @param pinout - From `projectPinout`.
 * @returns CSV text with a header row per table.
 */
export const pinoutCsv = ({ nets, slots }: Pinout): string => {
  const rows = [
    ["Net", "Designator", "Part", "Pin"],
    ...nets.flatMap((n) => n.pins.map((p) => [n.net, p.componentId, p.part, p.pin])),
  ];
  if (slots.length) {
    rows.push(
      [],
      ["Designator", "Part", "Pin", "Host", "Host pin", "Signal"],
      ...slots.map((s) => [s.partId, s.part, s.pin, s.hostId, s.hostPin, s.signal]),
    );
  }
  return `${rows.map((r) => r.map(csvCell).join(",")).join("\n")}\n`;
};
