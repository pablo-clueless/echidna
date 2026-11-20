import { builds, partsById } from "@echidna/library";
import type { PinRef } from "@echidna/core";

import { useProjectStore } from "@/stores/project";
import { slotOptions } from "@/lib/project/slots";
import { useStudioStore } from "@/stores/studio";

export type ToolOutcome = { content: string; isError: boolean };

type Input = Record<string, unknown>;

const ok = (result: unknown): ToolOutcome => ({
  content: typeof result === "string" ? result : JSON.stringify(result),
  isError: false,
});

const fail = (message: string): ToolOutcome => ({ content: message, isError: true });

const str = (input: Input, key: string): string | null =>
  typeof input[key] === "string" && input[key] !== "" ? (input[key] as string) : null;

const project = () => useProjectStore.getState();

const componentOf = (id: string) => project().components.find((c) => c.id === id);

const pinOf = (value: unknown): PinRef | null => {
  if (typeof value !== "object" || value === null) return null;
  const { componentId, pinId } = value as Record<string, unknown>;
  return typeof componentId === "string" && typeof pinId === "string"
    ? { componentId, pinId }
    : null;
};

const pinError = (ref: PinRef): string | null => {
  const component = componentOf(ref.componentId);
  if (!component) return `There is no part ${ref.componentId} in the project.`;
  const spec = partsById.get(component.specId);
  if (!spec?.pins.some((p) => p.id === ref.pinId)) {
    return `${ref.componentId} (${component.specId}) has no pin ${ref.pinId}. Its pins are: ${spec?.pins.map((p) => p.id).join(", ") || "none"}.`;
  }
  return null;
};

/** Where a new part goes in the schematic: right of everything already there, so it never lands on another part. */
const freeSchematicSpot = () => {
  const xs = Object.values(project().schematic).map((at) => at.x);
  return { x: xs.length ? Math.max(...xs) + 6 : 6, y: 6 };
};

/**
 * The open project as the assistant reads it: compact, with IDs it can pass back to the other tools and the latest
 * warn and fail verdicts.
 * @returns A plain object, serialised to JSON for the tool result.
 */
export const describeProject = () => {
  const p = project();
  const studio = useStudioStore.getState();
  const issues = studio.violations.filter((v) => v.severity !== "pass");
  return {
    name: p.name || null,
    foundation: p.foundation,
    boardSizeMm: p.boardSize,
    ambientTemperatureK: p.ambientTemperature,
    simulating: studio.simulating,
    solverError: studio.simulation?.error ?? null,
    selectedPartId: studio.selectedComponentId,
    parts: p.components.map((c) => ({
      id: c.id,
      specId: c.specId,
      name: partsById.get(c.specId)?.name ?? c.specId,
      ...(c.variant ? { variant: c.variant } : {}),
      ...(c.paramOverrides ? { paramOverrides: c.paramOverrides } : {}),
      ...(p.slots[c.id]
        ? {
            pluggedInto: {
              hostId: p.slots[c.id]!.hostId,
              slotId: p.slots[c.id]!.slotId,
              railId: p.slots[c.id]!.railId ?? null,
            },
          }
        : {}),
    })),
    wires: p.wires.map((w) => ({
      id: w.id,
      a: `${w.a.componentId}.${w.a.pinId}`,
      b: `${w.b.componentId}.${w.b.pinId}`,
    })),
    verdicts: {
      checksRun: studio.violations.length,
      issues: issues.map((v) => ({
        partId: v.componentId,
        rule: v.ruleId,
        severity: v.severity,
        actual: v.actual,
        limit: v.limit,
        unit: v.unit,
        estimated: v.estimated,
      })),
    },
  };
};

const run = (name: string, input: Input): ToolOutcome => {
  const store = project();
  switch (name) {
    case "get_project":
      return ok(describeProject());

    case "get_slot_options": {
      const partId = str(input, "partId");
      if (!partId || !componentOf(partId))
        return fail(`There is no part ${partId} in the project.`);
      const options = slotOptions(store, partsById, partId);
      if (!options.length)
        return ok("This part doesn't plug into a slot, or no host board in the project has one.");
      return ok(
        options.map((o) => ({
          hostId: o.hostId,
          slotId: o.slot.id,
          fits: o.fit.fits,
          occupiedBy: o.occupant ?? null,
          problems: o.fit.checks
            .filter((c) => c.severity !== "pass")
            .map((c) => ({
              check: c.id,
              severity: c.severity,
              actual: c.actual,
              limit: c.limit,
              unit: c.unit,
            })),
        })),
      );
    }

    case "select_part": {
      const partId = str(input, "partId");
      if (!partId || !componentOf(partId))
        return fail(`There is no part ${partId} in the project.`);
      useStudioStore.getState().selectComponent(partId);
      return ok(`Selected ${partId}.`);
    }

    case "add_part": {
      const specId = str(input, "specId");
      const spec = specId ? partsById.get(specId) : undefined;
      if (!specId || !spec) return fail(`There is no catalogue part ${specId}.`);
      const id = store.addComponent(specId, freeSchematicSpot());
      if (!id) {
        return fail(
          `${specId} can't go on this project's foundation (${store.foundation}). It is for: ${spec.deviceTypes.join(", ")}.`,
        );
      }
      return ok({ id, specId });
    }

    case "remove_part": {
      const partId = str(input, "partId");
      if (!partId || !componentOf(partId))
        return fail(`There is no part ${partId} in the project.`);
      store.removeComponent(partId);
      return ok(`Removed ${partId}.`);
    }

    case "connect": {
      const a = pinOf(input.a);
      const b = pinOf(input.b);
      if (!a || !b) return fail("Both pins need a componentId and a pinId.");
      const error = pinError(a) ?? pinError(b);
      if (error) return fail(error);
      const before = store.wires.length;
      store.connect(a, b);
      const after = project().wires;
      if (after.length === before) return ok("Those pins are already wired together.");
      return ok({ wireId: after.at(-1)?.id });
    }

    case "remove_wire": {
      const wireId = str(input, "wireId");
      if (!wireId || !store.wires.some((w) => w.id === wireId))
        return fail(`There is no wire ${wireId}.`);
      store.removeWire(wireId);
      return ok(`Removed wire ${wireId}.`);
    }

    case "set_param": {
      const partId = str(input, "partId");
      const param = str(input, "param");
      const component = partId ? componentOf(partId) : undefined;
      const spec = component ? partsById.get(component.specId) : undefined;
      if (!partId || !component || !spec) return fail(`There is no part ${partId} in the project.`);
      const keys = new Set([
        ...Object.keys(spec.params),
        ...(spec.variants ?? []).flatMap((v) => Object.keys(v.params ?? {})),
      ]);
      if (!param || !keys.has(param)) {
        return fail(
          `${partId} has no parameter ${param}. Its parameters are: ${[...keys].join(", ") || "none"}.`,
        );
      }
      const value = input.value;
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
        return fail("The value must be a finite number in SI base units, or null.");
      }
      store.setParam(partId, param, value ?? undefined);
      return ok(
        value === null ? `Reset ${partId}.${param}.` : `Set ${partId}.${param} to ${value}.`,
      );
    }

    case "set_variant": {
      const partId = str(input, "partId");
      const variant = str(input, "variant");
      const component = partId ? componentOf(partId) : undefined;
      const spec = component ? partsById.get(component.specId) : undefined;
      if (!partId || !component || !spec) return fail(`There is no part ${partId} in the project.`);
      const variants = spec.variants ?? [];
      if (!variant || !variants.some((v) => v.id === variant)) {
        return fail(
          `${partId} has no variant ${variant}. Its variants are: ${variants.map((v) => v.id).join(", ") || "none"}.`,
        );
      }
      store.setVariant(partId, variant);
      return ok(`${partId} is now ${variant}.`);
    }

    case "swap_part": {
      const partId = str(input, "partId");
      const specId = str(input, "specId");
      if (!partId || !componentOf(partId))
        return fail(`There is no part ${partId} in the project.`);
      if (!specId || !partsById.has(specId)) return fail(`There is no catalogue part ${specId}.`);
      const wasIn = store.slots[partId];
      store.swapInSlots(partId, specId);
      if (componentOf(partId)?.specId !== specId) {
        return fail(`${specId} can't go on this project's foundation (${store.foundation}).`);
      }
      const nowIn = project().slots[partId];
      return ok({
        partId,
        specId,
        ...(wasIn ? { stillPluggedIn: Boolean(nowIn) } : {}),
      });
    }

    case "plug_in": {
      const partId = str(input, "partId");
      const hostId = str(input, "hostId");
      const slotId = str(input, "slotId");
      if (!partId || !hostId || !slotId) return fail("partId, hostId and slotId are all needed.");
      const fit = store.plugIn(partId, hostId, slotId);
      if (!fit)
        return fail(
          `${partId} can't go in slot ${slotId} on ${hostId}: the part, host or slot doesn't exist, or the slot doesn't take this kind of part.`,
        );
      const pluggedIn =
        project().slots[partId]?.hostId === hostId && project().slots[partId]?.slotId === slotId;
      const result = {
        pluggedIn,
        checks: fit.checks.map((c) => ({
          check: c.id,
          severity: c.severity,
          actual: c.actual,
          limit: c.limit,
          unit: c.unit,
        })),
      };
      return pluggedIn ? ok(result) : { content: JSON.stringify(result), isError: true };
    }

    case "unplug": {
      const partId = str(input, "partId");
      if (!partId || !store.slots[partId]) return fail(`${partId} isn't plugged into a slot.`);
      store.unplug(partId);
      return ok(`Unplugged ${partId}.`);
    }

    case "set_ambient_temperature": {
      const kelvin = input.kelvin;
      if (typeof kelvin !== "number" || !Number.isFinite(kelvin))
        return fail("kelvin must be a number.");
      store.setAmbientTemperature(kelvin);
      return ok(`Ambient temperature is now ${project().ambientTemperature} K.`);
    }

    case "load_build": {
      const buildId = str(input, "buildId");
      if (!buildId || !builds.some((b) => b.id === buildId))
        return fail(`There is no build ${buildId}.`);
      store.loadBuild(buildId);
      return ok(`Loaded the ${buildId} build with ${project().components.length} parts.`);
    }

    case "load_preset": {
      const hostSpecId = str(input, "hostSpecId");
      if (!hostSpecId || !partsById.get(hostSpecId)?.host)
        return fail(`${hostSpecId} isn't a host board.`);
      store.loadPreset(hostSpecId);
      return ok(`Started a new project on ${hostSpecId}.`);
    }

    case "arrange_schematic":
      store.arrangeSchematic();
      return ok("Arranged the schematic.");

    default:
      return fail(`Unknown tool ${name}.`);
  }
};

/**
 * Runs one of the assistant's tool calls against the open project. Bad input comes back as an error result for
 * the model to correct, never as a thrown error.
 * @param name - The tool's name.
 * @param input - The tool call's input.
 * @returns The tool result's text and whether it is an error.
 */
export const executeTool = (name: string, input: unknown): ToolOutcome => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return fail("The tool input must be an object.");
  }
  try {
    return run(name, input as Input);
  } catch (error) {
    return fail(`The tool failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};
