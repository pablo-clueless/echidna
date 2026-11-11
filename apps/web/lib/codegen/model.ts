import type { ComponentSpec, HostSlot } from "@echidna/core";

import { deriveNets, type ProjectData } from "@/lib/project/model";

/** The kinds of dev board code is written for, each with its own toolchains. */
export type BoardFamily = "esp32" | "arduino" | "raspberryPi";

const FAMILIES: Record<string, BoardFamily> = {
  "esp32-devkitc": "esp32",
  "arduino-uno-r4": "arduino",
  "raspberry-pi-4": "raspberryPi",
  "raspberry-pi-5": "raspberryPi",
};

/**
 * A board pin as code names it: `gpio` is the number the toolchain uses (ESP32 and Raspberry Pi GPIO numbers,
 * Arduino digital pin numbers) and `arduino` the Arduino constant for analogue-header pins, such as `A4`.
 */
export type Pin = { label: string; gpio: number; arduino: string };

export type Peripheral =
  | { type: "bme280"; id: string; name: string; address: number }
  | { type: "ds18b20"; id: string; name: string; data: Pin }
  | { type: "hcsr04"; id: string; name: string; trig: Pin; echo: Pin }
  /** An I²C part with no driver here: the code scans the bus for it. */
  | { type: "i2c"; id: string; name: string }
  /** A GPIO pin driving parts wired to it, such as an LED through its resistor. */
  | { type: "output"; id: string; name: string; pin: Pin; parts: string[] }
  /** A GPIO pin reading parts wired to it, such as a switch or a PIR sensor's output. */
  | { type: "input"; id: string; name: string; pin: Pin; parts: string[] };

export type FirmwareTarget = {
  family: BoardFamily;
  /** The board's designator, such as `B1`. */
  boardId: string;
  boardName: string;
  specId: string;
  /** The I²C pins, when anything uses the bus. */
  i2c?: { sda: Pin; scl: Pin };
  peripherals: Peripheral[];
  /** Other dev boards in the project, which the code leaves out. */
  ignoredBoards: string[];
};

/** Arduino Uno R4 analogue pins are digital pins 14 to 19. */
const ARDUINO_ANALOGUE_BASE = 14;

/**
 * The pin a board's pin name stands for: `GPIO21 SDA` is GPIO 21, `D2` digital pin 2, `A4 SDA` Arduino's `A4`.
 * @param label - The pin's name in the part library.
 * @returns The pin, or `undefined` for a name with no number, such as `3V3`.
 */
export const pinFromLabel = (label: string): Pin | undefined => {
  const gpio = /GPIO(\d+)/.exec(label);
  if (gpio) return { label, gpio: Number(gpio[1]), arduino: gpio[1] ?? "" };
  const digital = /^D(\d+)/.exec(label);
  if (digital) return { label, gpio: Number(digital[1]), arduino: digital[1] ?? "" };
  const analogue = /^A(\d+)/.exec(label);
  if (analogue)
    return {
      label,
      gpio: ARDUINO_ANALOGUE_BASE + Number(analogue[1]),
      arduino: `A${analogue[1] ?? ""}`,
    };
  return undefined;
};

/** The BME280's address with its SDO pin to ground, as on most breakout boards. */
const BME280_ADDRESS = 0x76;

/** Part kinds and models that are read by a pin rather than driven by it. */
const INPUT_KINDS = new Set(["switch"]);
const INPUT_MODELS = new Set(["pirSensor"]);

/**
 * What the code for a project's dev board has to do: which sensors are plugged into its slots and on which pins, and
 * which of its GPIO pins drive or read parts wired straight to them. The first dev board is the one programmed.
 * @param project - The open project.
 * @param specs - Part lookup by spec ID.
 * @returns The target, or `null` when the project has no dev board to program.
 */
export const firmwareTarget = (
  project: Pick<ProjectData, "components" | "wires" | "slots">,
  specs: ReadonlyMap<string, ComponentSpec>,
): FirmwareTarget | null => {
  const boards = project.components.filter((c) => FAMILIES[c.specId]);
  const board = boards[0];
  const spec = board && specs.get(board.specId);
  const family = board && FAMILIES[board.specId];
  if (!board || !spec?.host || !family) return null;
  const specOf = (id: string) =>
    specs.get(project.components.find((c) => c.id === id)?.specId ?? "");
  const pinOf = (pinId: string | undefined) =>
    pinFromLabel(spec.pins.find((p) => p.id === pinId)?.name ?? "");
  const slotOf = (id: string): HostSlot | undefined => spec.host?.slots.find((s) => s.id === id);

  const peripherals: Peripheral[] = [];
  let usesI2c = false;
  const plugged = new Set<string>();
  for (const [partId, at] of Object.entries(project.slots)) {
    if (at.hostId !== board.id) continue;
    const part = specOf(partId);
    const slot = slotOf(at.slotId);
    if (!part || !slot) continue;
    plugged.add(partId);
    const signal = (name: string) => pinOf(slot.signals?.[name]);
    const name = part.name;
    const io1 = signal("IO1");
    const io2 = signal("IO2");
    if (part.id === "bme280") {
      usesI2c = true;
      peripherals.push({ type: "bme280", id: partId, name, address: BME280_ADDRESS });
    } else if (part.id === "ds18b20" && io1) {
      peripherals.push({ type: "ds18b20", id: partId, name, data: io1 });
    } else if (part.id === "hc-sr04" && io1 && io2) {
      peripherals.push({ type: "hcsr04", id: partId, name, trig: io1, echo: io2 });
    } else if (part.interfaces.some((i) => i.protocol === "i2c")) {
      usesI2c = true;
      peripherals.push({ type: "i2c", id: partId, name });
    } else if (io1) {
      peripherals.push({ type: "input", id: partId, name, pin: io1, parts: [partId] });
    }
  }

  // Signal pins with parts wired straight to them, not through a slot.
  const nets = deriveNets(project.wires);
  const i2cSlot = spec.host.slots.find((s) => s.accepts.some((a) => a.protocol === "i2c"));
  const i2cPins = new Set(Object.values(i2cSlot?.signals ?? {}));
  const signalPins = [
    ...new Set(spec.host.slots.flatMap((s) => Object.values(s.signals ?? {}))),
  ].filter((p) => !i2cPins.has(p));
  const taken = new Set(
    peripherals.flatMap((p) =>
      p.type === "ds18b20"
        ? [p.data.gpio]
        : p.type === "hcsr04"
          ? [p.trig.gpio, p.echo.gpio]
          : p.type === "input" || p.type === "output"
            ? [p.pin.gpio]
            : [],
    ),
  );
  for (const pinId of signalPins) {
    const pin = pinOf(pinId);
    if (!pin || taken.has(pin.gpio)) continue;
    const net = nets.find((n) =>
      n.pins.some((p) => p.componentId === board.id && p.pinId === pinId),
    );
    const parts = [
      ...new Set(
        (net?.pins ?? [])
          .map((p) => p.componentId)
          .filter((id) => id !== board.id && !plugged.has(id)),
      ),
    ];
    if (parts.length === 0) continue;
    const input = parts.some((id) => {
      const s = specOf(id);
      return s && (INPUT_KINDS.has(s.kind) || INPUT_MODELS.has(s.model));
    });
    peripherals.push({
      type: input ? "input" : "output",
      id: pin.label.replace(/\s.*/, ""),
      name: parts.map((id) => `${id} ${specOf(id)?.name ?? ""}`.trim()).join(", "),
      pin,
      parts,
    });
  }

  const sda = pinOf(i2cSlot?.signals?.SDA);
  const scl = pinOf(i2cSlot?.signals?.SCL);
  peripherals.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));

  return {
    family,
    boardId: board.id,
    boardName: spec.name,
    specId: spec.id,
    ...(usesI2c && sda && scl ? { i2c: { sda, scl } } : {}),
    peripherals,
    ignoredBoards: boards.slice(1).map((b) => b.id),
  };
};

/** A name usable as an identifier in every language here: `S1`, `GPIO4`. */
export const ident = (id: string) => id.replace(/[^A-Za-z0-9]/g, "_").replace(/^(\d)/, "_$1");
