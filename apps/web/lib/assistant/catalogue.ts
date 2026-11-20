import type { ComponentSpec, Interface, SpecValue } from "@echidna/core";
import { builds, parts } from "@echidna/library";

const value = ({ value: v, unit, source }: SpecValue) =>
  `${Number(v.toPrecision(4))}${unit === "1" ? "" : ` ${unit}`}${source === "estimated" ? " (est.)" : ""}`;

const values = (entries: Record<string, SpecValue | undefined>) =>
  Object.entries(entries)
    .flatMap(([key, v]) => (v ? [`${key}=${value(v)}`] : []))
    .join(", ");

const protocol = (i: Interface) =>
  [i.protocol, i.lanes ? `x${i.lanes}` : "", i.connector ? `(${i.connector})` : ""].join("");

const partLine = (spec: ComponentSpec) => {
  const lines = [
    `- ${spec.id}: ${spec.name} [${spec.kind}; ${spec.deviceTypes.join("/")}]`,
    `  pins: ${spec.pins.map((p) => `${p.id} (${p.name})`).join(", ") || "none"}`,
  ];
  const params = values(spec.params);
  if (params) lines.push(`  params: ${params}`);
  const ratings = values(spec.ratings);
  if (ratings) lines.push(`  ratings: ${ratings}`);
  if (spec.interfaces.length)
    lines.push(`  interfaces: ${spec.interfaces.map(protocol).join(", ")}`);
  if (spec.variants?.length) lines.push(`  variants: ${spec.variants.map((v) => v.id).join(", ")}`);
  if (spec.host) {
    const rails = spec.host.rails.map(
      (r) => `${r.id} ${value(r.voltage)} max ${value(r.maxCurrent)}`,
    );
    if (rails.length) lines.push(`  rails: ${rails.join("; ")}`);
    lines.push(
      `  slots: ${spec.host.slots.map((s) => `${s.id} (${s.accepts.map(protocol).join("/")})`).join("; ")}`,
    );
  }
  return lines.join("\n");
};

/**
 * The parts catalogue and reference builds as compact text for the assistant's system prompt. It is built from the
 * bundled library alone, so it is the same on every request and stays in the prompt cache.
 * @returns One block per part, then one line per build.
 */
export const catalogueText = (): string =>
  [
    "## Parts",
    ...parts.map(partLine),
    "",
    "## Reference builds (for load_build)",
    ...builds.map(
      (b) =>
        `- ${b.id} [${b.deviceType}]: host ${b.hostId}; ${Object.entries(b.modules)
          .map(([slot, part]) => `${slot}=${part}`)
          .join(", ")}`,
    ),
  ].join("\n");
