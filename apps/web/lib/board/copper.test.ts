import { describe, expect, it } from "vitest";

import { regulatorExample } from "@/lib/project/example";
import { projectCopper, TRACK_WIDTH } from "./copper";

describe("projectCopper", () => {
  const project = regulatorExample();
  const { drills, routing } = projectCopper(project);

  it("drills every through-hole pin: supply terminal, resistor and LED", () => {
    expect(drills).toHaveLength(6);
  });

  it("routes each net on the board with one track fewer than its pads", () => {
    const byNet = new Map<string, number>();
    for (const trace of routing.traces) {
      // A top-layer stub from a pad down to a via is part of the bottom-layer connection, not a connection of its own.
      const [, end] = trace.points;
      if (trace.layer === "top" && routing.vias.some((v) => v.x === end?.[0] && v.z === end?.[1])) continue;
      byNet.set(trace.net, (byNet.get(trace.net) ?? 0) + 1);
    }
    // Supply → U1 in; U1 out (pin and tab) → R1; R1 → D1 anode; and ground joins D1 cathode, V1− and U1 gnd.
    expect([...byNet.values()].sort()).toEqual([1, 1, 2, 2]);
  });

  it("uses wide tracks for the supply and ground nets", () => {
    expect(new Set(routing.traces.map((t) => t.width))).toEqual(new Set([TRACK_WIDTH.power, TRACK_WIDTH.signal]));
  });

  it("leaves unwired pins unrouted", () => {
    const bare = projectCopper({ ...project, wires: [] });
    expect(bare.routing.traces).toEqual([]);
    expect(bare.drills).toHaveLength(6);
  });
});
