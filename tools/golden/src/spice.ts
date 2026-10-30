import type { Circuit, TransientOptions } from "@echidna/solver/types";

/** A transient run to compare, with the times to sample it at. Each time must fall on a step. */
export type TransientCheck = TransientOptions & { at: number[] };

/** One value ngspice measures during a transient run. */
export type Measure = { time: number; name: string } & ({ node: string } | { source: string });

/** A SPICE deck for a circuit, with the names needed to read results back. */
export type SpiceDeck = {
  netlist: string;
  /** Our node name → SPICE node name. Ground is `0`. */
  nodes: Map<string, string>;
  /** Our voltage source id → SPICE vector holding its branch current. */
  sourceCurrents: Map<string, string>;
  /** For a transient deck, the measurements it prints. */
  measures: Measure[];
};

const value = (n: number) => n.toExponential(12);

/**
 * Writes an ngspice deck that prints every node voltage and source current: at the DC operating point, or with
 * `transient`, at each of its sample times in a run from switch-on (`uic`), with the step capped at ours.
 * Node and element names are replaced with SPICE-safe ones, since ours contain `:` and `/`.
 * Our behavioural regulator becomes a B-source holding `min(V(gnd) + Vset, V(in) − dropout)` behind a 0 V
 * sense source, a current-controlled source drawing the output current from the input, and the quiescent current.
 * MOSFETs have their body tied to the source, as ours do.
 * @param circuit - Circuit in solver format.
 * @param title - First line of the deck.
 * @param transient - A transient run to measure instead of the operating point.
 * @returns The deck and name mappings.
 */
export const toSpice = (circuit: Circuit, title: string, transient?: TransientCheck): SpiceDeck => {
  const nodes = new Map<string, string>([[circuit.ground, "0"]]);
  const node = (name: string) => {
    let spice = nodes.get(name);
    if (!spice) {
      spice = `n${nodes.size}`;
      nodes.set(name, spice);
    }
    return spice;
  };
  const sourceCurrents = new Map<string, string>();
  const lines = [`* ${title}`, ".option rshunt=1e12"];

  circuit.elements.forEach((element, i) => {
    const [a = "", b = "", c = ""] = element.nodes.map(node);
    const name = `${i}`;
    switch (element.kind) {
      case "resistor":
        lines.push(`R${name} ${a} ${b} ${value(element.resistance)}`);
        break;
      case "switch":
        // A closed switch is its contact resistance; an open one is left out, as the solver leaves it unstamped.
        if ((element.closed ?? 1) === 1) lines.push(`R${name} ${a} ${b} ${value(element.contactResistance)}`);
        break;
      case "capacitor":
        lines.push(`C${name} ${a} ${b} ${value(element.capacitance)}`);
        break;
      case "inductor":
        lines.push(`L${name} ${a} ${b} ${value(element.inductance)}`);
        break;
      case "voltageSource":
        lines.push(`V${name} ${a} ${b} DC ${value(element.voltage)}`);
        sourceCurrents.set(element.id, `v${name}#branch`);
        break;
      case "currentSource":
        lines.push(`I${name} ${a} ${b} DC ${value(element.current)}`);
        break;
      case "diode": {
        const model = `dmod${name}`;
        lines.push(`D${name} ${a} ${b} ${model}`);
        lines.push(
          `.model ${model} D(IS=${value(element.saturationCurrent)} N=${value(element.emissionCoefficient ?? 1)} RS=${value(element.seriesResistance ?? 0)})`,
        );
        break;
      }
      case "linearRegulator": {
        const [input, output, ground] = [a, b, c];
        const pass = `x${name}`;
        const vset = value(element.outputVoltage);
        const dropout = value(element.dropoutVoltage ?? 0);
        lines.push(`B${name} ${pass} 0 V = min(v(${ground}) + ${vset}, v(${input}) - ${dropout})`);
        lines.push(`Vsense${name} ${pass} ${output} DC 0`);
        lines.push(`F${name} ${input} 0 Vsense${name} 1`);
        lines.push(`Iq${name} ${input} ${ground} DC ${value(element.quiescentCurrent ?? 0)}`);
        break;
      }
      case "bjt": {
        const model = `qmod${name}`;
        const early = element.earlyVoltage ? ` VAF=${value(element.earlyVoltage)}` : "";
        lines.push(`Q${name} ${a} ${b} ${c} ${model}`);
        lines.push(
          `.model ${model} ${element.polarity.toUpperCase()}(IS=${value(element.saturationCurrent)} BF=${value(element.forwardBeta)} BR=${value(element.reverseBeta ?? 1)}${early})`,
        );
        break;
      }
      case "mosfet": {
        const model = `mmod${name}`;
        // W = L, so KP alone sets the gain. IS = 0 removes the bulk junctions, which our model leaves out.
        lines.push(`M${name} ${a} ${b} ${c} ${c} ${model} W=100u L=100u`);
        lines.push(
          `.model ${model} ${element.channel.toUpperCase()}MOS(LEVEL=1 VTO=${value(element.thresholdVoltage)} KP=${value(element.transconductance)} LAMBDA=${value(element.channelLengthModulation ?? 0)} IS=0)`,
        );
        break;
      }
    }
  });

  const measures: Measure[] = [];
  if (transient) {
    const step = value(transient.timeStep);
    transient.at.forEach((time, i) => {
      for (const [ours, spice] of nodes) {
        if (spice !== "0") measures.push({ time, name: `m${i}_${spice}`, node: ours });
      }
      for (const [id, vector] of sourceCurrents) measures.push({ time, name: `m${i}_${vector.replace("#", "_")}`, source: id });
    });
    lines.push(".control", `tran ${step} ${value(transient.stopTime)} 0 ${step} uic`);
    for (const m of measures) {
      const quantity = "node" in m ? `v(${nodes.get(m.node)})` : `i(${sourceCurrents.get(m.source)?.replace("#branch", "")})`;
      lines.push(`meas tran ${m.name} find ${quantity} at=${value(m.time)}`);
    }
    lines.push(".endc", ".end", "");
  } else {
    lines.push(".control", "op", "print all", ".endc", ".end", "");
  }
  return { netlist: lines.join("\n"), nodes, sourceCurrents, measures };
};

const assignment = /^\s*(?:v\(([^)]+)\)|([\w#.]+))\s*=\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*$/i;

/**
 * Reads `name = value` lines printed by ngspice's `print all`, accepting both `v(n1)` and bare `n1` forms.
 * @param output - ngspice standard output.
 * @returns Vector name (lower case, without `v(…)`) → value.
 */
export const parsePrintAll = (output: string): Map<string, number> => {
  const vectors = new Map<string, number>();
  for (const line of output.split(/\r?\n/)) {
    const match = assignment.exec(line);
    if (!match) continue;
    const [, wrapped, bare, number = ""] = match;
    const name = (wrapped ?? bare ?? "").toLowerCase();
    if (name) vectors.set(name, Number(number));
  }
  return vectors;
};
