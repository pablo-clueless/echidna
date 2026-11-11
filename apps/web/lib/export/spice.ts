import type { CircuitElement } from "@echidna/solver/types";
import { type ComponentSpec } from "@echidna/core";
import { toCircuit } from "@echidna/library";

import { type ProjectData, toNetlist } from "@/lib/project/model";

/** SPICE scale suffixes, largest first. `meg` because SPICE reads `M` as milli. */
const SCALES: [number, string][] = [
  [1e12, "T"],
  [1e9, "G"],
  [1e6, "meg"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "u"],
  [1e-9, "n"],
  [1e-12, "p"],
  [1e-15, "f"],
];

/**
 * A value as SPICE writes it, with a scale suffix: 4700 → `4.7k`, 1e-6 → `1u`.
 * @param value - Value in SI units.
 * @returns Up to six significant figures and a suffix.
 */
export const spiceNumber = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  const magnitude = Math.abs(value);
  if (magnitude === 0) return "0";
  const [scale, suffix] = SCALES.find(([s]) => magnitude >= s * 0.9999995) ?? [1e-15, "f"];
  return `${Number((value / scale).toPrecision(6))}${suffix}`;
};

/** A name SPICE accepts: letters, digits and underscores. */
const safe = (name: string) => name.replace(/[^A-Za-z0-9_]/g, "_");

/**
 * An element name starting with the letter SPICE uses to tell its type, keeping the designator readable: `R1` stays
 * `R1`, an LED `D1` stays `D1`, and a host rail `B1:3v3` becomes `VB1_3v3`.
 */
const elementName = (letter: string, id: string) => {
  const name = safe(id);
  return name.toUpperCase().startsWith(letter) && !name.includes("_") ? name : `${letter}${name}`;
};

export type SpiceExport = {
  /** The deck, ready for ngspice or LTspice. */
  deck: string;
  /** Parts that are checked as a build rather than solved, so are left out, such as a desktop's modules. */
  skipped: string[];
};

/**
 * Writes the project's circuit as a SPICE deck, element for element as Echidna's solver sees it, ending with an
 * operating-point analysis. Nets are named after their first pin, such as `R1_2`; ground is `0`; a pin wired to
 * nothing gets a node of its own, `NC_…`. The behavioural regulator becomes a B-source clamped to the input less its
 * dropout, a current-controlled source drawing the output current from the input, and its quiescent current, as the
 * ngspice comparison in CI writes it. MOSFETs have their body tied to the source.
 * @param project - The open project.
 * @param specs - Part lookup by spec ID.
 * @param title - First line of the deck.
 * @returns The deck, and the parts left out of it.
 */
export const projectSpice = (
  project: Pick<ProjectData, "name" | "components" | "wires">,
  specs: ReadonlyMap<string, ComponentSpec>,
  title = project.name.trim() || "Echidna project",
): SpiceExport => {
  const { circuit } = toCircuit(toNetlist(project), specs);
  const nodes = new Map<string, string>([[circuit.ground, "0"]]);
  const node = (name: string) => {
    const known = nodes.get(name);
    if (known) return known;
    // `n:net:R1/2` → `R1_2`; `p:R1/2`, a pin wired to nothing, → `NC_R1_2`.
    const spice = name.startsWith("p:")
      ? `NC_${safe(name.slice(2))}`
      : safe(name.replace(/^n:net:/, ""));
    let unique = spice;
    for (let i = 2; [...nodes.values()].includes(unique); i++) unique = `${spice}_${i}`;
    nodes.set(name, unique);
    return unique;
  };

  const lines = [
    `* ${title.replace(/\r?\n/g, " ")}`,
    "* Exported from Echidna. Values in SI units; ground is node 0.",
    "",
  ];
  const models: string[] = [];
  const describe = (element: CircuitElement) => {
    const [componentId] = element.id.split(":");
    const component = project.components.find((c) => c.id === componentId);
    const spec = component && specs.get(component.specId);
    return spec ? `* ${element.id}: ${spec.name}` : `* ${element.id}`;
  };

  for (const element of circuit.elements) {
    const [a = "", b = "", c = ""] = element.nodes.map(node);
    lines.push(describe(element));
    switch (element.kind) {
      case "resistor":
        lines.push(`${elementName("R", element.id)} ${a} ${b} ${spiceNumber(element.resistance)}`);
        break;
      case "switch":
        // An open switch carries nothing, as the solver leaves it out; a closed one is its contact resistance.
        lines.push(
          (element.closed ?? 1) === 1
            ? `${elementName("R", element.id)} ${a} ${b} ${spiceNumber(element.contactResistance)}`
            : `* (open: not connected)`,
        );
        break;
      case "capacitor":
        lines.push(`${elementName("C", element.id)} ${a} ${b} ${spiceNumber(element.capacitance)}`);
        break;
      case "inductor":
        lines.push(`${elementName("L", element.id)} ${a} ${b} ${spiceNumber(element.inductance)}`);
        break;
      case "voltageSource":
        lines.push(`${elementName("V", element.id)} ${a} ${b} DC ${spiceNumber(element.voltage)}`);
        break;
      case "currentSource":
        lines.push(`${elementName("I", element.id)} ${a} ${b} DC ${spiceNumber(element.current)}`);
        break;
      case "diode": {
        const model = `D_${safe(element.id)}`;
        lines.push(`${elementName("D", element.id)} ${a} ${b} ${model}`);
        models.push(
          `.model ${model} D(IS=${spiceNumber(element.saturationCurrent)} N=${spiceNumber(element.emissionCoefficient ?? 1)} RS=${spiceNumber(element.seriesResistance ?? 0)})`,
        );
        break;
      }
      case "linearRegulator": {
        const name = safe(element.id);
        const pass = `${name}_pass`;
        lines.push(
          `B${name} ${pass} 0 V = min(v(${c}) + ${spiceNumber(element.outputVoltage)}, v(${a}) - ${spiceNumber(element.dropoutVoltage ?? 0)})`,
          `Vsense_${name} ${pass} ${b} DC 0`,
          `F${name} ${a} 0 Vsense_${name} 1`,
          `Iq_${name} ${a} ${c} DC ${spiceNumber(element.quiescentCurrent ?? 0)}`,
        );
        break;
      }
      case "bjt": {
        const model = `Q_${safe(element.id)}`;
        const early = element.earlyVoltage ? ` VAF=${spiceNumber(element.earlyVoltage)}` : "";
        lines.push(`${elementName("Q", element.id)} ${a} ${b} ${c} ${model}`);
        models.push(
          `.model ${model} ${element.polarity.toUpperCase()}(IS=${spiceNumber(element.saturationCurrent)} BF=${spiceNumber(element.forwardBeta)} BR=${spiceNumber(element.reverseBeta ?? 1)}${early})`,
        );
        break;
      }
      case "mosfet": {
        const model = `M_${safe(element.id)}`;
        lines.push(`${elementName("M", element.id)} ${a} ${b} ${c} ${c} ${model} W=100u L=100u`);
        models.push(
          `.model ${model} ${element.channel.toUpperCase()}MOS(LEVEL=1 VTO=${spiceNumber(element.thresholdVoltage)} KP=${spiceNumber(element.transconductance)} LAMBDA=${spiceNumber(element.channelLengthModulation ?? 0)})`,
        );
        break;
      }
      default:
        lines.push(`* (no SPICE equivalent)`);
    }
  }

  const solved = new Set(circuit.elements.map((e) => e.id.split(":")[0]));
  const skipped = project.components
    .filter((c) => {
      const model = specs.get(c.specId)?.model;
      return model !== "ground" && !solved.has(c.id);
    })
    .map((c) => c.id);
  if (skipped.length)
    lines.push("", `* Checked as a build, not as a circuit, so left out: ${skipped.join(", ")}`);
  if (circuit.elements.length === 0) lines.push("", "* No circuit to simulate.");

  lines.push("", ...models, ...(models.length ? [""] : []), ".op", ".end", "");
  return { deck: lines.join("\n"), skipped };
};
