import type { Circuit, CircuitElement } from "@echidna/solver/types";
import type { ComponentSpec, Netlist } from "@echidna/core";

export const GROUND_NODE = "0";

/** Solver parameters each model cannot do without. */
export const requiredParams: Record<string, readonly string[]> = {
  ground: [],
  resistor: ["resistance"],
  capacitor: ["capacitance"],
  inductor: ["inductance"],
  voltageSource: ["voltage"],
  currentSource: ["current"],
  diode: ["saturationCurrent"],
  linearRegulator: ["outputVoltage"],
};

export type CircuitBuild = {
  circuit: Circuit;
  /** Solver node for a net, so net voltages can be read back from the solution. */
  netNodes: Record<string, string>;
  /** Spec used for each solved component, by component ID. */
  specs: Record<string, ComponentSpec>;
};

/**
 * Turns the electrical model into solver input. Nets touching a ground symbol (or the netlist's ground net)
 * become the reference node; unconnected pins get a node of their own so a half-wired circuit still solves.
 * @param netlist - Components and nets from the store.
 * @param specs - Part lookup by spec ID.
 * @returns The circuit plus the mappings needed to read results back.
 */
export const toCircuit = (netlist: Netlist, specs: ReadonlyMap<string, ComponentSpec>): CircuitBuild => {
  const used: Record<string, ComponentSpec> = {};
  for (const c of netlist.components) {
    const spec = specs.get(c.specId);
    if (spec) used[c.id] = spec;
  }

  const groundNets = new Set(
    netlist.nets
      .filter((n) => n.id === netlist.groundNetId || n.pins.some((p) => used[p.componentId]?.model === "ground"))
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
    if (!spec || spec.model === "ground") continue;
    const nodes = spec.pins.map((pin) => {
      const net = pinNet.get(`${c.id}/${pin.id}`);
      return net === undefined ? `p:${c.id}/${pin.id}` : (netNodes[net] ?? `n:${net}`);
    });
    const values = Object.fromEntries(Object.entries(spec.params).map(([k, v]) => [k, v.value]));
    elements.push({ id: c.id, nodes, kind: spec.model, ...values, ...c.paramOverrides } as CircuitElement);
  }

  return { circuit: { ground: GROUND_NODE, elements }, netNodes, specs: used };
};
