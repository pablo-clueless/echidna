import type { ComponentSpec } from "@echidna/core";
import { describe, expect, it } from "vitest";
import { partsById } from "@echidna/library";

import {
  acceptsPart,
  fitsFoundation,
  foundationForDevice,
  foundationOf,
  foundationsFor,
} from "./foundation";

const spec = (id: string) => partsById.get(id) as ComponentSpec;

describe("foundations", () => {
  it("puts circuit parts and dev boards on a PCB, and modules in their device's chassis", () => {
    expect(foundationsFor(spec("resistor"))).toEqual(["pcb"]);
    expect(foundationsFor(spec("raspberry-pi-5"))).toEqual(["pcb"]);
    expect(foundationsFor(spec("b760-atx"))).toEqual(["desktop"]);
    expect(foundationsFor(spec("ultrabook-board"))).toEqual(["laptop"]);
    expect(foundationsFor(spec("nvme-ssd-1tb"))).toEqual(["desktop", "laptop"]);
    expect(foundationsFor(spec("fpv-frame-5in"))).toEqual(["drone"]);
    expect(foundationsFor(spec("esc-4in1-45a"))).toEqual(["drone"]);
  });

  it("puts each kind of ready-made build on its own foundation", () => {
    expect(foundationForDevice("desktop")).toBe("desktop");
    expect(foundationForDevice("laptop")).toBe("laptop");
    expect(foundationForDevice("drone")).toBe("drone");
    expect(foundationForDevice("iot")).toBe("pcb");
  });

  it("never puts a laptop board on a PCB, or a resistor in a laptop", () => {
    expect(fitsFoundation(spec("ultrabook-board"), "pcb")).toBe(false);
    expect(fitsFoundation(spec("ultrabook-board"), "desktop")).toBe(false);
    expect(fitsFoundation(spec("resistor"), "laptop")).toBe(false);
  });

  it("lets an empty project take anything, and a started one only what fits", () => {
    const laptopBoard = spec("ultrabook-board");
    expect(acceptsPart({ foundation: "pcb", components: [] }, laptopBoard)).toBe(true);
    expect(
      acceptsPart(
        { foundation: "pcb", components: [{ id: "R1", specId: "resistor" }] },
        laptopBoard,
      ),
    ).toBe(false);
  });

  it("works out an older project's foundation from a part only one chassis takes", () => {
    expect(foundationOf([spec("resistor"), spec("led-5mm")])).toBe("pcb");
    expect(foundationOf([spec("nvme-ssd-1tb"), spec("ultrabook-board")])).toBe("laptop");
    expect(foundationOf([spec("nvme-ssd-1tb")])).toBe("desktop");
    expect(foundationOf([spec("dji-mini-2-battery")])).toBe("drone");
    expect(foundationOf([])).toBe("pcb");
  });
});
