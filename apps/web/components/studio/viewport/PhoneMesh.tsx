"use client";

import { CatmullRomCurve3, ExtrudeGeometry, Path, Shape, Vector3 } from "three";
import { RoundedBox } from "@react-three/drei";
import type { HostSpec } from "@echidna/core";
import { useEffect, useMemo } from "react";

import { phoneLayoutOf, type PhoneLayout } from "@/lib/board/footprints";
import { PhoneKeysAndPorts, WearableKeys } from "./DevicePorts";
import { materials } from "./materials";

/** The housing's floor, the inside of the back glass, in millimetres; boards and parts inside stand on it. */
export const HOUSING_FLOOR = 0.8;

/** How thick each kind of housing is, and how far its corners are rounded, in millimetres. */
const HOUSING = {
  phone: { height: 7.8, rail: 1.6, corner: 9 },
  wearable: { height: 10.5, rail: 1.4, corner: 8 },
} as const;

/** A wireless charging coil's thickness: a phone's battery sits on it. */
const COIL_HEIGHT = 0.5;

/** Traces a rounded rectangle centred on the origin into a shape or hole. */
const roundedRect = <T extends Shape | Path>(path: T, w: number, d: number, r: number): T => {
  const [x, z] = [w / 2, d / 2];
  const c = Math.min(r, x, z);
  path.moveTo(-x + c, -z);
  path.lineTo(x - c, -z);
  path.quadraticCurveTo(x, -z, x, -z + c);
  path.lineTo(x, z - c);
  path.quadraticCurveTo(x, z, x - c, z);
  path.lineTo(-x + c, z);
  path.quadraticCurveTo(-x, z, -x, z - c);
  path.lineTo(-x, -z + c);
  path.quadraticCurveTo(-x, -z, -x + c, -z);
  return path;
};

/**
 * A phone's or wearable's housing opened up from the front: the inside of the back glass, with the frame's rails
 * round it. The logic board and the rest sit inside, drawn by their own parts.
 */
const Housing = ({ layout, family }: { layout: PhoneLayout; family: string }) => {
  const { height, rail, corner } = HOUSING[layout.kind];
  const { width, depth } = layout;
  const rails = useMemo(() => {
    const outer = roundedRect(new Shape(), width, depth, corner);
    outer.holes.push(roundedRect(new Path(), width - rail * 2, depth - rail * 2, corner - rail));
    return new ExtrudeGeometry(outer, { depth: height, bevelEnabled: false, curveSegments: 24 });
  }, [width, depth, corner, rail, height]);
  const floor = useMemo(
    () =>
      new ExtrudeGeometry(roundedRect(new Shape(), width, depth, corner), {
        depth: HOUSING_FLOOR,
        bevelEnabled: false,
        curveSegments: 24,
      }),
    [width, depth, corner],
  );
  useEffect(
    () => () => {
      rails.dispose();
      floor.dispose();
    },
    [rails, floor],
  );
  return (
    <group>
      <mesh
        geometry={floor}
        rotation={[-Math.PI / 2, 0, 0]}
        material={materials.glass}
        receiveShadow
      />
      <mesh
        geometry={rails}
        rotation={[-Math.PI / 2, 0, 0]}
        material={materials.anodised}
        castShadow
        receiveShadow
      />
      {layout.kind === "phone" ? (
        <PhoneKeysAndPorts width={width} depth={depth} height={height} rail={rail} />
      ) : (
        <WearableKeys width={width} depth={depth} height={height} watch={family === "watch"} />
      )}
    </group>
  );
};

/** A battery cell in its printed wrap. A phone's sits in the housing on the charging coil; a wearable's on the mat. */
const Battery = ({ layout }: { layout: PhoneLayout }) => {
  const height = layout.kind === "phone" ? 4.4 : 3.6;
  const lift = layout.kind === "phone" ? HOUSING_FLOOR + COIL_HEIGHT : 0;
  return (
    <RoundedBox
      args={[layout.battery.w, height, layout.battery.d]}
      radius={1}
      smoothness={3}
      position={[0, lift + height / 2, 0]}
      material={materials.pouch}
      castShadow
      receiveShadow
    />
  );
};

/** A display panel lying face down beside the housing, opened out on its flex cable, graphite film uppermost. */
const Display = ({ layout }: { layout: PhoneLayout }) => {
  const { w, d } = layout.display;
  const corner = HOUSING[layout.kind].corner - 1;
  return (
    <group>
      <RoundedBox
        args={[w, 1.4, d]}
        radius={Math.min(corner, 0.6)}
        smoothness={2}
        position={[0, 0.7, 0]}
        material={materials.glass}
        castShadow
        receiveShadow
      />
      <mesh position={[0, 1.42, 0]} material={materials.graphite} receiveShadow>
        <boxGeometry args={[w - 6, 0.04, d - 10]} />
      </mesh>
    </group>
  );
};

/** Lens positions on a camera module, in millimetres from its centre: in a column, a pair, or a triangle. */
const lenses = ({ w, d }: { w: number; d: number }): [number, number, number][] => {
  const r = Math.min(w, d / 3) * 0.36;
  if (d > w * 2) return [-1, 0, 1].map((i) => [0, (i * d) / 3.2, r]);
  if (w >= 30)
    return [
      [-w / 4, -d / 4, w / 7],
      [-w / 4, d / 4, w / 7],
      [w / 4, 0, w / 7],
    ];
  if (d > w * 1.5) return [-1, 1].map((i) => [0, (i * d) / 4, w * 0.38]);
  return [
    [-w / 4, -d / 4, w / 6],
    [w / 4, d / 4, w / 6],
  ];
};

/** A rear camera module seated in the housing's corner, its lenses facing down into the back glass's bump. */
const Camera = ({ layout }: { layout: PhoneLayout }) => {
  const { w, d } = layout.camera;
  const height = 5.5;
  return (
    <group position={[0, HOUSING_FLOOR, 0]}>
      <RoundedBox
        args={[w, height, d]}
        radius={1}
        smoothness={2}
        position={[0, height / 2, 0]}
        material={materials.caseSteel}
        castShadow
        receiveShadow
      />
      {lenses(layout.camera).map(([x, z, r]) => (
        <mesh key={`${x},${z}`} position={[x, height + 0.15, z]} material={materials.lens}>
          <cylinderGeometry args={[r, r, 0.3, 32]} />
        </mesh>
      ))}
    </group>
  );
};

/** A phone's or wearable's housing, battery, display or rear camera, by its `phone/` footprint. */
export const PhoneMesh = ({ footprintId }: { footprintId: string }) => {
  const found = phoneLayoutOf(footprintId);
  if (!found) return null;
  const { part, layout } = found;
  const family = footprintId.slice(footprintId.indexOf("-") + 1);
  switch (part) {
    case "housing":
      return <Housing layout={layout} family={family} />;
    case "battery":
      return <Battery layout={layout} />;
    case "display":
      return <Display layout={layout} />;
    case "camera":
      return <Camera layout={layout} />;
  }
};

/** Width and thickness of a flex cable, in millimetres. */
const FLEX = { width: 4, thickness: 0.12 } as const;

/** A flat flex cable from one point to another, arched so it clears what lies between. */
const FlexCable = ({ from, to, clear }: { from: Vector3; to: Vector3; clear: number }) => {
  const geometry = useMemo(() => {
    const rise = Math.max(from.y, to.y, clear) + 1.5 + from.distanceTo(to) * 0.04;
    const curve = new CatmullRomCurve3([
      from,
      new Vector3(from.x * 0.75 + to.x * 0.25, rise, from.z * 0.75 + to.z * 0.25),
      new Vector3(from.x * 0.25 + to.x * 0.75, rise, from.z * 0.25 + to.z * 0.75),
      to,
    ]);
    const section = new Shape();
    section.moveTo(-FLEX.thickness / 2, -FLEX.width / 2);
    section.lineTo(FLEX.thickness / 2, -FLEX.width / 2);
    section.lineTo(FLEX.thickness / 2, FLEX.width / 2);
    section.lineTo(-FLEX.thickness / 2, FLEX.width / 2);
    return new ExtrudeGeometry(section, { steps: 32, bevelEnabled: false, extrudePath: curve });
  }, [from, to, clear]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={materials.flex} castShadow raycast={() => null} />;
};

/** A board-to-board connector's receptacle and the plug on the cable's end, in millimetres. */
const CONNECTOR = { width: FLEX.width + 1.8, length: 3.2, receptacle: 0.55, plug: 0.45 } as const;

/**
 * Where a flex cable plugs in: on the board, a black board-to-board receptacle with its row of gold contacts; on the
 * cable's end, the stiffened plug pressed into it. Turned to face along the cable, from where it leaves.
 */
const FlexConnector = ({
  at,
  towards,
  kind,
}: {
  at: Vector3;
  towards: Vector3;
  kind: "receptacle" | "plug";
}) => {
  const turn = Math.atan2(towards.x - at.x, towards.z - at.z);
  const receptacle = kind === "receptacle";
  const height = receptacle ? CONNECTOR.receptacle : CONNECTOR.plug;
  // The receptacle stands on the board, under the cable's end; the plug sits on top of the cable's end.
  const y = receptacle ? at.y - 0.1 + height / 2 : at.y + FLEX.thickness / 2 + height / 2;
  return (
    <group position={[at.x, y, at.z]} rotation={[0, turn, 0]}>
      <RoundedBox
        args={[CONNECTOR.width, height, CONNECTOR.length]}
        radius={Math.min(0.2, height / 2 - 0.01)}
        smoothness={2}
        material={receptacle ? materials.epoxy : materials.caseSteel}
        castShadow
        raycast={() => null}
      />
      {receptacle && (
        <mesh
          position={[0, height / 2 + 0.005, -CONNECTOR.length / 2 + 0.4]}
          material={materials.gold}
          raycast={() => null}
        >
          <boxGeometry args={[CONNECTOR.width - 1, 0.01, 0.5]} />
        </mesh>
      )}
    </group>
  );
};

/** Height of a seated part's top above the housing floor, by slot, where its flex cable lands. */
const landing = (slotId: string): number =>
  slotId === "battery" ? HOUSING_FLOOR + COIL_HEIGHT + 4.4 : slotId === "display" ? 1.4 : 2;

/**
 * The boards a phone's or wearable's logic board is made of, in millimetres from the host's centre: each board, the
 * interposer frame a stacked board stands on, the flex cable to a sub-board, and a flex cable out to each part that
 * is plugged into a flex connector.
 * @param host - The logic board's host spec.
 * @param occupied - The IDs of the slots something is plugged into.
 */
export const StackedBoards = ({
  host,
  occupied,
  footprintId,
}: {
  host: HostSpec;
  occupied: ReadonlySet<string>;
  /** The host's housing footprint, whose walls a cable to a part laid out beside it has to clear. */
  footprintId: string;
}) => {
  const housing = phoneLayoutOf(footprintId)?.layout;
  // A cable out to a part beside the housing arches over its wall; one to a part inside stays low.
  const clearOf = (x: number, z: number) =>
    housing && (Math.abs(x) > housing.width / 2 || Math.abs(z) > housing.depth / 2)
      ? HOUSING[housing.kind].height
      : 0;
  const boards = useMemo(() => host.boards ?? [], [host.boards]);
  const main = boards[0];
  const cables = useMemo(() => {
    if (!main) return [];
    const top = main.y + main.thickness;
    const toSlots = host.slots.flatMap((slot) =>
      slot.flex && slot.seat && occupied.has(slot.id)
        ? [
            {
              key: slot.id,
              from: new Vector3(slot.flex.x, top + 0.1, slot.flex.z),
              to: new Vector3(slot.seat.x, landing(slot.id), slot.seat.z),
            },
          ]
        : [],
    );
    const toBoards = boards.flatMap((b) =>
      b.joint === "flex"
        ? [
            {
              key: b.id,
              from: new Vector3(main.x, top + 0.1, main.z + main.depth / 2),
              to: new Vector3(b.x, b.y + b.thickness + 0.1, b.z - b.depth / 2 + 2),
            },
          ]
        : [],
    );
    return [...toSlots, ...toBoards];
  }, [host.slots, boards, main, occupied]);
  if (!main) return null;

  return (
    <group>
      {boards.map((b) => (
        <group key={b.id}>
          <RoundedBox
            args={[b.width, b.thickness, b.depth]}
            radius={Math.min(0.3, b.thickness / 2)}
            smoothness={2}
            position={[b.x, b.y + b.thickness / 2, b.z]}
            material={materials.mask}
            castShadow
            receiveShadow
          />
          {b.joint === "interposer" && (
            <Interposer
              x={b.x}
              z={b.z}
              width={b.width}
              depth={b.depth}
              bottom={main.y + main.thickness}
              top={b.y}
            />
          )}
        </group>
      ))}
      {cables.map((c) => (
        <group key={c.key}>
          <FlexCable from={c.from} to={c.to} clear={clearOf(c.to.x, c.to.z)} />
          <FlexConnector at={c.from} towards={c.to} kind="receptacle" />
          <FlexConnector at={c.from} towards={c.to} kind="plug" />
          <FlexConnector at={c.to} towards={c.from} kind="receptacle" />
          <FlexConnector at={c.to} towards={c.from} kind="plug" />
        </group>
      ))}
    </group>
  );
};

/** The interposer a stacked board stands on: a ring of board round its edge, joining it to the board below. */
const Interposer = ({
  x,
  z,
  width,
  depth,
  bottom,
  top,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  bottom: number;
  top: number;
}) => {
  const wall = 1.6;
  const height = top - bottom;
  if (height <= 0) return null;
  const sides: [number, number, number, number][] = [
    [0, -depth / 2 + wall / 2, width, wall],
    [0, depth / 2 - wall / 2, width, wall],
    [-width / 2 + wall / 2, 0, wall, depth - wall * 2],
    [width / 2 - wall / 2, 0, wall, depth - wall * 2],
  ];
  return (
    <group position={[x, bottom + height / 2, z]}>
      {sides.map(([sx, sz, w, d]) => (
        <mesh key={`${sx},${sz}`} position={[sx, 0, sz]} material={materials.laminate} castShadow>
          <boxGeometry args={[w, height, d]} />
        </mesh>
      ))}
    </group>
  );
};
