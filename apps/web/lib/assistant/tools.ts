import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";

const pin = {
  type: "object",
  properties: {
    componentId: { type: "string", description: "The part's ID in the project, such as R1." },
    pinId: { type: "string", description: "The pin's ID on that part, from the catalogue." },
  },
  required: ["componentId", "pinId"],
  additionalProperties: false,
} as const;

const object = (
  properties: Record<string, unknown>,
  required: string[] = Object.keys(properties),
): BetaTool["input_schema"] => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const id = (description: string) => ({ type: "string", description });

/**
 * Every tool the assistant can call. They all run in the browser, against the open project: the read-only ones
 * whatever the mode, the rest straight away in auto mode and once the user applies them in manual mode.
 */
export const ASSISTANT_TOOLS = [
  {
    name: "get_project",
    description:
      "Reads the open project: its foundation, every part with its ID, catalogue part, variant and parameter overrides, every wire, which slot each part is plugged into, the ambient temperature, and the latest pass / warn / fail verdicts from the solver. Call it before changing anything and again after changes to see their verdicts.",
    input_schema: object({}),
  },
  {
    name: "get_slot_options",
    description:
      "Lists every host-board slot in the project a part could plug into, each checked first: whether it fits, which checks warn or fail, and what is already in the slot.",
    input_schema: object({ partId: id("The part's ID in the project.") }),
  },
  {
    name: "select_part",
    description:
      "Selects a part in the studio so the user sees it highlighted in the schematic and 3D view and its readings in the inspector.",
    input_schema: object({ partId: id("The part's ID in the project.") }),
  },
  {
    name: "add_part",
    description:
      "Adds a catalogue part to the project. The first part into an empty project sets its foundation. Returns the new part's ID.",
    input_schema: object({ specId: id("The catalogue part ID, such as resistor or led-5mm.") }),
  },
  {
    name: "remove_part",
    description:
      "Removes a part and every wire touching it. A removed host board unplugs everything in it.",
    input_schema: object({ partId: id("The part's ID in the project.") }),
  },
  {
    name: "connect",
    description: "Wires two pins together.",
    input_schema: object({ a: pin, b: pin }),
  },
  {
    name: "remove_wire",
    description: "Removes a wire by its ID, from get_project.",
    input_schema: object({ wireId: id("The wire's ID, such as W3.") }),
  },
  {
    name: "set_param",
    description:
      "Sets one of a part's parameters, such as a resistor's resistance, in SI base units (ohms, volts, amps, farads, watts, kelvin). Pass null to return it to the catalogue value.",
    input_schema: object({
      partId: id("The part's ID in the project."),
      param: id("The parameter's key, from the catalogue."),
      value: {
        type: ["number", "null"],
        description: "The value in SI base units, or null to reset it.",
      },
    }),
  },
  {
    name: "set_variant",
    description: "Chooses one of a part's variants, such as an LED's colour.",
    input_schema: object({
      partId: id("The part's ID in the project."),
      variant: id("The variant's ID, from the catalogue."),
    }),
  },
  {
    name: "swap_part",
    description:
      "Replaces a part with another catalogue part, keeping its ID and wiring. A part in a slot stays plugged in if the new one still fits; a swapped host board keeps everything that still fits.",
    input_schema: object({
      partId: id("The part's ID in the project."),
      specId: id("The catalogue part ID to swap in."),
    }),
  },
  {
    name: "plug_in",
    description:
      "Plugs a part into a host board's slot, wiring its supply, ground and signals, if it passes every slot check. Returns the checks, so a refusal says why.",
    input_schema: object({
      partId: id("The part's ID in the project."),
      hostId: id("The host board's ID in the project."),
      slotId: id("The slot's ID on that host, from the catalogue."),
    }),
  },
  {
    name: "unplug",
    description: "Takes a part out of its slot, removing the wires plugging it in added.",
    input_schema: object({ partId: id("The part's ID in the project.") }),
  },
  {
    name: "set_ambient_temperature",
    description:
      "Sets the air temperature around the board, in kelvin, that part temperatures are estimated from.",
    input_schema: object({ kelvin: { type: "number", description: "Temperature in kelvin." } }),
  },
  {
    name: "load_build",
    description:
      "Replaces the whole project with a reference build, such as the gaming desktop, with every module plugged in. Only use it when the user asks to start over or start from a build.",
    input_schema: object({ buildId: id("The build ID, from the catalogue.") }),
  },
  {
    name: "load_preset",
    description:
      "Replaces the whole project with a bare host board, such as a Raspberry Pi 5, with nothing plugged in. Only use it when the user asks to start over or start from a board.",
    input_schema: object({ hostSpecId: id("The host board's catalogue part ID.") }),
  },
  {
    name: "arrange_schematic",
    description:
      "Tidies the schematic, laying out everything plugged into each host board beside it.",
    input_schema: object({}),
  },
] as const satisfies readonly BetaTool[];

export type AssistantToolName = (typeof ASSISTANT_TOOLS)[number]["name"];

/** Tools that only read the project or move the selection, so they run without asking even in manual mode. */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set<AssistantToolName>([
  "get_project",
  "get_slot_options",
  "select_part",
]);

/**
 * The tool definitions as sent to the API: strict, so every input matches its schema.
 * @returns The tools, in a fixed order so the prompt cache prefix stays stable.
 */
export const apiTools = (): BetaTool[] =>
  ASSISTANT_TOOLS.map((tool) => ({ ...tool, input_schema: tool.input_schema, strict: true }));
