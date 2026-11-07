"use client";

import { RoundedBox } from "@react-three/drei";
import type { ReactNode } from "react";
import type { Material } from "three";

import { populate, PROFILES, type Rect, type SmallPart } from "@/lib/board/population";
import { SmallParts } from "./SmallParts";
import { materials } from "./materials";

/**
 * Desktop, laptop, drone, phone and wearable modules in their real form rather than plain blocks: a graphics card's
 * shroud and fans, a cooler's fin stack and heat pipes, memory under its heat spreaders, an SSD's chips on a
 * populated board. Lengths in millimetres; each form stands on its origin, x along its outline's width and z along
 * its depth, as the plain block it replaces did.
 */

type Vec3 = [number, number, number];

/** A box by its size and centre. */
const Box = ({
  size,
  at,
  material,
  radius = 0,
}: {
  size: Vec3;
  at: Vec3;
  material: Material;
  radius?: number;
}) =>
  radius > 0 ? (
    <RoundedBox
      args={size}
      radius={Math.min(radius, ...size.map((s) => s / 2.01))}
      smoothness={2}
      position={at}
      material={material}
      castShadow
      receiveShadow
    />
  ) : (
    <mesh position={at} material={material} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );

/** A cylinder standing on the y axis, by radius, height and centre. */
const Cylinder = ({
  radius,
  height,
  at,
  material,
  segments = 32,
}: {
  radius: number;
  height: number;
  at: Vec3;
  material: Material;
  segments?: number;
}) => (
  <mesh position={at} material={material} castShadow receiveShadow>
    <cylinderGeometry args={[radius, radius, height, segments]} />
  </mesh>
);

/**
 * An axial fan facing up the y axis: its dark throat, hub and swept blades.
 * @param radius - Blade tip radius.
 * @param depth - How deep the fan is along its axis.
 * @param blades - How many blades.
 */
const Fan = ({ radius, depth, blades = 9 }: { radius: number; depth: number; blades?: number }) => {
  const hub = radius * 0.34;
  const length = radius - hub - radius * 0.04;
  return (
    <group>
      <Cylinder
        radius={radius}
        height={depth * 0.8}
        at={[0, 0, 0]}
        material={materials.cavity}
        segments={48}
      />
      <Cylinder
        radius={hub}
        height={depth * 0.9}
        at={[0, depth * 0.05, 0]}
        material={materials.plastic}
      />
      <Cylinder
        radius={hub * 0.6}
        height={0.2}
        at={[0, depth * 0.5 + 0.1, 0]}
        material={materials.padMarking}
      />
      {Array.from({ length: blades }, (_, i) => {
        const angle = (i / blades) * Math.PI * 2;
        const mid = hub + length / 2;
        return (
          <group key={i} rotation={[0, angle, 0]}>
            <mesh
              position={[mid, depth * 0.1, 0]}
              rotation={[0.45, 0, 0]}
              material={materials.plastic}
              castShadow
            >
              <boxGeometry args={[length, 0.5, radius * 0.42]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

/** Each module board's small parts, laid out once: they depend only on the board's seed and size. */
const populated = new Map<string, SmallPart[]>();

/**
 * A board for a module: solder mask with its chips, and small parts filling the rest, laid out from `seed`.
 * @param w - Width.
 * @param d - Depth.
 * @param thickness - Board thickness.
 * @param chips - Major chips on it, which the small parts keep clear of.
 */
const ModulePcb = ({
  w,
  d,
  thickness,
  chips,
  seed,
  y = 0,
}: {
  w: number;
  d: number;
  thickness: number;
  chips: (Rect & { h: number; material?: Material; bga?: boolean })[];
  seed: string;
  y?: number;
}) => {
  const key = `${seed}:${w}:${d}`;
  let small = populated.get(key);
  if (!small) {
    small = populate(
      { width: w, depth: d },
      chips.map((c) => ({ ...c, w: c.w + 0.6, d: c.d + 0.6 })),
      PROFILES.card,
      seed,
    );
    populated.set(key, small);
  }
  const top = y + thickness;
  return (
    <group>
      <Box size={[w, thickness, d]} at={[0, y + thickness / 2, 0]} material={materials.mask} />
      {chips.map((c) =>
        c.bga ? (
          <group key={`${c.x},${c.z}`}>
            <Box
              size={[c.w, 0.3, c.d]}
              at={[c.x, top + 0.15, c.z]}
              material={materials.substrate}
            />
            <Box
              size={[c.w * 0.88, c.h - 0.3, c.d * 0.88]}
              at={[c.x, top + 0.3 + (c.h - 0.3) / 2, c.z]}
              material={c.material ?? materials.epoxy}
            />
          </group>
        ) : (
          <Box
            key={`${c.x},${c.z}`}
            size={[c.w, c.h, c.d]}
            at={[c.x, top + c.h / 2, c.z]}
            material={c.material ?? materials.epoxy}
          />
        ),
      )}
      <group position={[0, top, 0]}>
        <SmallParts parts={small} />
      </group>
    </group>
  );
};

/** A graphics card on edge: I/O bracket, PCB with its PCIe fingers, backplate, and a shroud with three fans. */
const GraphicsCard = ({ w, d, h }: Size) => {
  const shroud = d - 4;
  const fanRadius = Math.min((h - 8) * 0.42, w / 6.8);
  return (
    <group>
      <Box
        size={[w * 0.96, h - 4, 1.6]}
        at={[w * 0.02, h / 2 + 2, -d / 2 + 2.3]}
        material={materials.mask}
      />
      <Box
        size={[w * 0.95, h - 10, 1]}
        at={[w * 0.02, h / 2 + 3, -d / 2 + 0.6]}
        material={materials.caseSteel}
        radius={0.4}
      />
      <Box size={[84, 8, 1.7]} at={[-w / 2 + 70, 4, -d / 2 + 2.3]} material={materials.gold} />
      <Box
        size={[w, h - 8, shroud]}
        at={[0, h / 2 + 4, d / 2 - shroud / 2]}
        material={materials.caseSteel}
        radius={3}
      />
      <Box size={[1.6, h + 6, d]} at={[-w / 2 - 0.8, h / 2, 0]} material={materials.plating} />
      {[-1, 0, 1].map((i) => (
        <group
          key={i}
          position={[i * w * 0.31 + w * 0.02, h / 2 + 4, d / 2 + 0.2]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <Fan radius={fanRadius} depth={3} blades={11} />
        </group>
      ))}
    </group>
  );
};

/** A tower cooler: copper base and heat pipes up through a stack of aluminium fins, with a fan on one face. */
const TowerCooler = ({ w, d, h }: Size) => {
  const stack = { w: w - 4, d: Math.min(55, d * 0.5), from: 38, to: h - 2 };
  const fins = Math.floor((stack.to - stack.from) / 2.4);
  const fan = Math.min(120, w - 4);
  return (
    <group>
      <Box size={[40, 7, 40]} at={[0, 3.5, 0]} material={materials.copper} radius={1} />
      {[-15, -5, 5, 15].map((x) => (
        <Cylinder
          key={x}
          radius={3}
          height={h - 10}
          at={[x, (h - 10) / 2 + 5, 0]}
          material={materials.copper}
        />
      ))}
      {Array.from({ length: fins }, (_, i) => (
        <Box
          key={i}
          size={[stack.w, 0.4, stack.d]}
          at={[0, stack.from + i * 2.4, 0]}
          material={materials.anodised}
        />
      ))}
      <group position={[0, stack.from + (stack.to - stack.from) / 2, stack.d / 2 + 13]}>
        <Box size={[fan, fan, 25]} at={[0, 0, 0]} material={materials.plastic} radius={3} />
        <group position={[0, 0, 12.7]} rotation={[Math.PI / 2, 0, 0]}>
          <Fan radius={fan * 0.47} depth={2} blades={9} />
        </group>
      </group>
    </group>
  );
};

/** An all-in-one cooler's pump block on the CPU: a copper cold plate under a round pump head. */
const PumpBlock = ({ w, d, h }: Size) => (
  <group>
    <Box size={[w * 0.8, 6, d * 0.8]} at={[0, 3, 0]} material={materials.copper} radius={1} />
    <Cylinder
      radius={Math.min(w, d) * 0.46}
      height={h - 8}
      at={[0, 6 + (h - 8) / 2, 0]}
      material={materials.plastic}
      segments={48}
    />
    <Cylinder
      radius={Math.min(w, d) * 0.4}
      height={1}
      at={[0, h - 1.5, 0]}
      material={materials.glass}
      segments={48}
    />
  </group>
);

/** A power supply: steel case with its fan grille on top and a rating label on the side. */
const PowerSupply = ({ w, d, h }: Size) => {
  const r = Math.min(w, d) * 0.4;
  return (
    <group>
      <Box size={[w, h, d]} at={[0, h / 2, 0]} material={materials.caseSteel} radius={1.5} />
      <Cylinder
        radius={r}
        height={0.4}
        at={[0, h + 0.05, 0]}
        material={materials.cavity}
        segments={64}
      />
      {[1, 0.8, 0.6, 0.4, 0.2].map((f) => (
        <mesh
          key={f}
          position={[0, h + 0.4, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          material={materials.lead}
        >
          <torusGeometry args={[r * f, 0.6, 6, 64]} />
        </mesh>
      ))}
      <Box
        size={[w * 0.5, h * 0.55, 0.3]}
        at={[0, h / 2, d / 2 + 0.15]}
        material={materials.padMarking}
      />
    </group>
  );
};

/** A desktop DIMM on edge: its board, gold fingers, heat spreaders on both faces and a light bar along the top. */
const Dimm = ({ w, h }: Size) => (
  <group>
    <Box size={[w, h - 1, 1.2]} at={[0, (h - 1) / 2, 0]} material={materials.mask} />
    <Box size={[w - 8, 3, 1.3]} at={[0, 1.5, 0]} material={materials.gold} />
    {[-1, 1].map((side) => (
      <Box
        key={side}
        size={[w - 2, h - 6, 1.4]}
        at={[0, (h - 6) / 2 + 4, side * 1.35]}
        material={materials.caseSteel}
        radius={0.5}
      />
    ))}
    <Box size={[w - 2, 2.5, 4]} at={[0, h - 1.25, 0]} material={materials.plastic} radius={0.6} />
  </group>
);

/** An SO-DIMM lying flat: its memory chips, gold fingers along one edge, and small parts. */
const SoDimm = ({ w, d }: Size) => (
  <group>
    <group position={[0, 0, -1.5]}>
      <ModulePcb
        w={w}
        d={d - 3}
        thickness={1}
        seed="sodimm"
        chips={[-1.5, -0.5, 0.5, 1.5].map((i) => ({
          x: i * w * 0.23,
          z: -2,
          w: 11,
          d: 9,
          h: 1,
          bga: true,
        }))}
      />
    </group>
    <Box size={[w - 6, 1.02, 3]} at={[0, 0.5, d / 2 - 1.5]} material={materials.gold} />
  </group>
);

/** An M.2 drive: controller, DRAM and two NAND packages on a populated board, with its edge connector. */
const M2Drive = ({ w, d }: Size) => (
  <group>
    <group position={[2, 0, 0]}>
      <ModulePcb
        w={w - 4}
        d={d}
        thickness={0.8}
        seed="m2"
        chips={[
          { x: -24, z: 0, w: 9, d: 9, h: 1.2, bga: true },
          { x: -11, z: 0, w: 9, d: 8, h: 1, bga: true },
          { x: 5, z: 0, w: 14, d: 17, h: 1.2, bga: true },
          { x: 23, z: 0, w: 14, d: 17, h: 1.2, bga: true },
        ]}
      />
    </group>
    <Box size={[4, 0.82, d - 3]} at={[-w / 2 + 2, 0.4, 0]} material={materials.gold} />
  </group>
);

/** A desktop CPU: its integrated heat spreader on a green substrate. */
const Cpu = ({ w, d, h }: Size) => (
  <group>
    <Box size={[w, 1.2, d]} at={[0, 0.6, 0]} material={materials.substrate} />
    <Box
      size={[w * 0.8, h - 1.2, d * 0.8]}
      at={[0, 1.2 + (h - 1.2) / 2, 0]}
      material={materials.plating}
      radius={1.2}
    />
  </group>
);

/** A laptop cooler: copper plates over the chips, heat pipes to fin stacks at the vents, and two blowers. */
const LaptopCooler = ({ w, d, h }: Size) => {
  const blower = Math.min(d * 0.38, w * 0.13);
  const vent = w / 2 - 4;
  return (
    <group>
      {[-0.15, 0.1].map((f) => (
        <Box
          key={f}
          size={[36, 1.5, 36]}
          at={[f * w, 0.75, -d * 0.08]}
          material={materials.copper}
          radius={0.4}
        />
      ))}
      {[-0.32, -0.18].map((f) => (
        <Box
          key={f}
          size={[w - 20, 2.4, 6]}
          at={[0, 2.7, f * d]}
          material={materials.copper}
          radius={1.1}
        />
      ))}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Cylinder
            radius={blower}
            height={h - 1}
            at={[side * (vent - blower - 8), (h - 1) / 2, d * 0.12]}
            material={materials.plastic}
            segments={48}
          />
          <group position={[side * (vent - blower - 8), h - 0.4, d * 0.12]}>
            <Fan radius={blower * 0.8} depth={0.8} blades={13} />
          </group>
          {Array.from({ length: 22 }, (_, i) => (
            <Box
              key={i}
              size={[6, h - 2, 0.25]}
              at={[side * vent, (h - 2) / 2, -d / 2 + 6 + i * ((d - 12) / 21)]}
              material={materials.anodised}
            />
          ))}
        </group>
      ))}
    </group>
  );
};

/** A laptop battery: three pouch cells side by side. */
const LaptopBattery = ({ w, d, h }: Size) => (
  <group>
    {[-1, 0, 1].map((i) => (
      <Box
        key={i}
        size={[w / 3 - 2, h - 0.4, d - 2]}
        at={[(i * w) / 3, (h - 0.4) / 2, 0]}
        material={materials.pouch}
        radius={1}
      />
    ))}
    <Box size={[w * 0.9, 0.2, 6]} at={[0, h - 0.3, d / 2 - 4]} material={materials.padMarking} />
  </group>
);

/** A Wi-Fi card: shield can, antenna connectors and gold fingers on a small board. */
const WifiCard = ({ w, d }: Size) => (
  <group>
    <ModulePcb
      w={w - 2}
      d={d}
      thickness={0.8}
      seed="wifi"
      chips={[{ x: -3, z: 0, w: 17, d: 15, h: 1.4, material: materials.plating }]}
    />
    {[-1, 1].map((s) => (
      <Cylinder
        key={s}
        radius={1.1}
        height={1.3}
        at={[w / 2 - 5, 1.45, s * 5]}
        material={materials.gold}
      />
    ))}
    <Box size={[2, 0.82, d - 3]} at={[-w / 2 + 1, 0.4, 0]} material={materials.gold} />
  </group>
);

/** A laptop display standing in the open lid: its bezel and the glass over the panel. */
const Display = ({ w, d, h }: Size) => (
  <group>
    <Box size={[w, h, d - 1]} at={[0, h / 2, 0]} material={materials.caseSteel} radius={2} />
    <Box
      size={[w - 12, h - 18, 0.4]}
      at={[0, h / 2 + 2, (d - 1) / 2 + 0.2]}
      material={materials.glass}
    />
  </group>
);

/** A DC jack: black body with its barrel opening. */
const DcJack = ({ w, d, h }: Size) => (
  <group>
    <Box size={[w, h, d]} at={[0, h / 2, 0]} material={materials.plastic} radius={0.4} />
    <mesh
      position={[-w / 2 - 0.01, h / 2, 0]}
      rotation={[0, 0, Math.PI / 2]}
      material={materials.cavity}
    >
      <cylinderGeometry args={[h * 0.3, h * 0.3, 0.1, 24]} />
    </mesh>
  </group>
);

/** A 4-in-1 ESC: three MOSFETs per motor in each corner, an MCU, and the motor pads at the corners. */
const Esc = ({ w, d }: Size) => {
  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx, sz] as const));
  const fets = corners.flatMap(([sx, sz]) =>
    [0, 1, 2].map((i) => ({ x: sx * w * 0.2, z: sz * (3.2 + i * 5.5), w: 5, d: 5, h: 1 })),
  );
  const pads = corners.map(([sx, sz]) => ({
    x: sx * (w / 2 - 2.5),
    z: sz * (d / 2 - 4),
    w: 3,
    d: 6,
    h: 0.1,
    material: materials.gold,
  }));
  return (
    <ModulePcb
      w={w - 1}
      d={d - 1}
      thickness={1.2}
      seed="esc"
      chips={[...fets, ...pads, { x: 0, z: 0, w: 5, d: 5, h: 0.9 }]}
    />
  );
};

/** A flight controller: MCU, IMU and barometer, its connectors and USB-C port. */
const FlightController = ({ w, d }: Size) => (
  <group>
    <ModulePcb
      w={w - 1}
      d={d - 1}
      thickness={1.2}
      seed="fc"
      chips={[
        { x: 0, z: 0, w: 10, d: 10, h: 1.4 },
        { x: 8, z: -8, w: 3, d: 3, h: 0.9 },
        { x: -8, z: -8, w: 2, d: 2.5, h: 0.8, material: materials.plating },
        { x: -12, z: 10, w: 8, d: 3.5, h: 3, material: materials.nylon },
        { x: 12, z: 10, w: 8, d: 3.5, h: 3, material: materials.nylon },
        { x: 0, z: d / 2 - 5, w: 9, d: 7.5, h: 3.2, material: materials.plating },
      ]}
    />
  </group>
);

/** A drone's LiPo pack in its wrap, with a label. */
const DroneBattery = ({ w, d, h }: Size) => (
  <group>
    <Box size={[w, h, d]} at={[0, h / 2, 0]} material={materials.pouch} radius={2} />
    <Box size={[w * 0.8, 0.2, d * 0.6]} at={[0, h + 0.05, 0]} material={materials.padMarking} />
  </group>
);

/** A camera: its body and the lens on the front. */
const Camera = ({ w, d, h }: Size) => {
  const r = Math.min(w, h) * 0.28;
  return (
    <group>
      <Box
        size={[w * 0.8, h * 0.75, d * 0.75]}
        at={[0, h * 0.45, 0]}
        material={materials.plastic}
        radius={1.5}
      />
      <mesh
        position={[0, h * 0.45, d * 0.375 + 2]}
        rotation={[Math.PI / 2, 0, 0]}
        material={materials.epoxy}
        castShadow
      >
        <cylinderGeometry args={[r, r, 4, 32]} />
      </mesh>
      <mesh
        position={[0, h * 0.45, d * 0.375 + 4.05]}
        rotation={[Math.PI / 2, 0, 0]}
        material={materials.lens}
      >
        <cylinderGeometry args={[r * 0.75, r * 0.75, 0.2, 32]} />
      </mesh>
    </group>
  );
};

/** A chip in a BGA package: its moulding on a green substrate. */
const Bga = ({ w, d, h }: Size) => (
  <group>
    <Box
      size={[w, Math.min(0.3, h / 3), d]}
      at={[0, Math.min(0.15, h / 6), 0]}
      material={materials.substrate}
    />
    <Box
      size={[w * 0.88, h - Math.min(0.3, h / 3), d * 0.88]}
      at={[0, Math.min(0.3, h / 3) + (h - Math.min(0.3, h / 3)) / 2, 0]}
      material={materials.epoxy}
    />
  </group>
);

/** A radio under its shield can. */
const ShieldCan = ({ w, d, h }: Size) => (
  <Box size={[w, h, d]} at={[0, h / 2, 0]} material={materials.plating} radius={0.1} />
);

/** A heart-rate sensor: its glass window over the LEDs and photodiodes. */
const HeartRate = ({ w, d, h }: Size) => (
  <group>
    <Cylinder
      radius={Math.min(w, d) * 0.48}
      height={h * 0.6}
      at={[0, h * 0.3, 0]}
      material={materials.plastic}
      segments={48}
    />
    <Cylinder
      radius={Math.min(w, d) * 0.42}
      height={h * 0.4}
      at={[0, h * 0.8, 0]}
      material={materials.glass}
      segments={48}
    />
  </group>
);

/** A linear resonant actuator: a round steel can. */
const Haptics = ({ w, d, h }: Size) => (
  <Cylinder
    radius={Math.min(w, d) * 0.48}
    height={h}
    at={[0, h / 2, 0]}
    material={materials.lead}
    segments={40}
  />
);

/** A wireless charging coil: copper turns on a ferrite sheet. */
const Coil = ({ w, h }: Size) => {
  const outer = w / 2 - 1;
  const turns = Math.floor((outer - outer * 0.3) / 1.3);
  return (
    <group>
      <Cylinder
        radius={outer + 0.5}
        height={h * 0.4}
        at={[0, h * 0.2, 0]}
        material={materials.plastic}
        segments={64}
      />
      {Array.from({ length: turns }, (_, i) => (
        <mesh
          key={i}
          position={[0, h * 0.4 + 0.2, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          material={materials.copper}
        >
          <torusGeometry args={[outer * 0.3 + i * 1.3, 0.35, 6, 64]} />
        </mesh>
      ))}
    </group>
  );
};

type Size = { w: number; d: number; h: number };

/** The form for each module footprint. Footprints without one, such as boards drawn as hosts, keep the plain block. */
const FORMS: Record<string, (size: Size) => ReactNode> = {
  "module/gpu": (s) => <GraphicsCard {...s} />,
  "module/cooler": (s) => <TowerCooler {...s} />,
  "module/aio": (s) => <PumpBlock {...s} />,
  "module/psu": (s) => <PowerSupply {...s} />,
  "module/memory": (s) => <Dimm {...s} />,
  "module/sodimm": (s) => <SoDimm {...s} />,
  "module/storage": (s) => <M2Drive {...s} />,
  "module/cpu": (s) => <Cpu {...s} />,
  "module/laptopCooler": (s) => <LaptopCooler {...s} />,
  "module/battery": (s) => <LaptopBattery {...s} />,
  "module/wifi": (s) => <WifiCard {...s} />,
  "module/display": (s) => <Display {...s} />,
  "module/charger": (s) => <DcJack {...s} />,
  "module/esc": (s) => <Esc {...s} />,
  "module/flightController": (s) => <FlightController {...s} />,
  "module/droneBattery": (s) => <DroneBattery {...s} />,
  "module/gimbal": (s) => <Camera {...s} />,
  "module/fpvCamera": (s) => <Camera {...s} />,
  "module/soc": (s) => <Bga {...s} />,
  "module/modem": (s) => <Bga {...s} />,
  "module/pmic": (s) => <Bga {...s} />,
  "module/wearableSoc": (s) => <Bga {...s} />,
  "module/wearablePmic": (s) => <Bga {...s} />,
  "module/imu": (s) => <Bga {...s} />,
  "module/radio": (s) => <ShieldCan {...s} />,
  "module/hrSensor": (s) => <HeartRate {...s} />,
  "module/haptics": (s) => <Haptics {...s} />,
  "module/coil": (s) => <Coil {...s} />,
};

/**
 * A module in its real form, if it has one.
 * @param footprintId - The module's footprint.
 * @param size - Its outline and height, in millimetres.
 * @returns The form, or `null` for a module drawn as a plain block.
 */
export const moduleForm = (footprintId: string, size: Size): ReactNode =>
  FORMS[footprintId]?.(size) ?? null;
