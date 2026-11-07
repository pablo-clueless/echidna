import { type ComponentSpec, type Netlist, withVariant } from "@echidna/core";
import type { Circuit, CircuitElement } from "@echidna/solver/types";

export const GROUND_NODE = "0";

/** Solver parameters each model cannot do without. */
export const requiredParams: Record<string, readonly string[]> = {
  ground: [],
  resistor: ["resistance"],
  switch: ["contactResistance", "closed"],
  capacitor: ["capacitance"],
  inductor: ["inductance"],
  voltageSource: ["voltage"],
  currentSource: ["current"],
  diode: ["saturationCurrent"],
  linearRegulator: ["outputVoltage"],
  npn: ["saturationCurrent", "forwardBeta"],
  pnp: ["saturationCurrent", "forwardBeta"],
  nmos: ["thresholdVoltage", "transconductance"],
  pmos: ["thresholdVoltage", "transconductance"],
  devBoard: [],
  load: [],
  module: [],
};

/** Library models that are one solver element with a fixed polarity, as SPICE `.model` types are. */
const polarised: Record<string, Record<string, string>> = {
  npn: { kind: "bjt", polarity: "npn" },
  pnp: { kind: "bjt", polarity: "pnp" },
  nmos: { kind: "mosfet", channel: "n" },
  pmos: { kind: "mosfet", channel: "p" },
};

export type CircuitBuild = {
  circuit: Circuit;
  /** Solver node for a net, so net voltages can be read back from the solution. */
  netNodes: Record<string, string>;
  /** Spec used for each solved component, by component ID, with its chosen variant applied. */
  specs: Record<string, ComponentSpec>;
};

/**
 * Turns the electrical model into solver input. Nets touching a ground symbol (or the netlist's ground net)
 * become the reference node; unconnected pins get a node of their own so a half-wired circuit still solves.
 * @param netlist - Components and nets from the store.
 * @param specs - Part lookup by spec ID.
 * @returns The circuit plus the mappings needed to read results back.
 */
export const toCircuit = (
  netlist: Netlist,
  specs: ReadonlyMap<string, ComponentSpec>,
): CircuitBuild => {
  const used: Record<string, ComponentSpec> = {};
  for (const c of netlist.components) {
    const spec = specs.get(c.specId);
    if (spec) used[c.id] = withVariant(spec, c.variant);
  }

  // A host board's ground is the reference too: a dev board and what is plugged into it need no ground symbol.
  const isGroundPin = (p: { componentId: string; pinId: string }) => {
    const spec = used[p.componentId];
    return spec?.model === "ground" || spec?.host?.groundPinId === p.pinId;
  };
  const groundNets = new Set(
    netlist.nets
      .filter((n) => n.id === netlist.groundNetId || n.pins.some(isGroundPin))
      .map((n) => n.id),
  );
  const netNodes: Record<string, string> = Object.fromEntries(
    netlist.nets.map((n) => [n.id, groundNets.has(n.id) ? GROUND_NODE : `n:${n.id}`]),
  );
  const pinNet = new Map<string, string>();
  for (const net of netlist.nets) {
    for (const p of net.pins) pinNet.set(`${p.componentId}/${p.pinId}`, net.id);
  }

  const elements: CircuitElement[] = [];
  for (const c of netlist.components) {
    const spec = used[c.id];
    // Desktop modules are checked as a build, not solved as a circuit.
    if (!spec || spec.model === "ground" || spec.model === "module") continue;
    const node = (pinId: string) => {
      if (spec.host?.groundPinId === pinId) return GROUND_NODE;
      const net = pinNet.get(`${c.id}/${pinId}`);
      return net === undefined ? `p:${c.id}/${pinId}` : (netNodes[net] ?? `n:${net}`);
    };
    if (spec.host) {
      // Each rail is an ideal source from the host's ground; the rule engine never sees these, as their IDs are
      // not components.
      for (const rail of spec.host.rails) {
        elements.push({
          id: `${c.id}:${rail.id}`,
          nodes: [node(rail.pinId), GROUND_NODE],
          kind: "voltageSource",
          voltage: rail.voltage.value,
        });
      }
      continue;
    }
    if (spec.model === "load" && spec.supply) {
      elements.push({
        id: c.id,
        nodes: [node(spec.supply.pinId), node(spec.supply.groundPinId)],
        kind: "currentSource",
        current: spec.supply.current.value,
      });
      continue;
    }
    const nodes = spec.pins.map((pin) => node(pin.id));
    const values = Object.fromEntries(Object.entries(spec.params).map(([k, v]) => [k, v.value]));
    elements.push({
      id: c.id,
      nodes,
      kind: spec.model,
      ...polarised[spec.model],
      ...values,
      ...c.paramOverrides,
    } as CircuitElement);
  }

  return { circuit: { ground: GROUND_NODE, elements }, netNodes, specs: used };
};
