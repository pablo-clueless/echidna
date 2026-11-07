"use client";

import { RoundedBox } from "@react-three/drei";

import { droneLayoutOf, type DroneLayout } from "@/lib/board/footprints";
import { materials } from "./materials";

/** The four motor positions, in millimetres from the frame's centre: front left, front right, back left, back right. */
const corners = (arm: number): [number, number][] => [
  [-arm, arm],
  [arm, arm],
  [-arm, -arm],
  [arm, -arm],
];

/** Width of an arm, in millimetres: a moulded arm is chunkier than a carbon one. */
const ARM_WIDTH = { moulded: 9, carbon: 7 } as const;

/** Thickness of an FPV frame's carbon plates, and how high its top plate stands on the standoffs. */
const PLATE = { thickness: 3, top: 28 } as const;

/**
 * A drone's frame: its body and four arms reaching out to the motor mounts. A camera drone's body is a moulded shell
 * its battery and camera sit on; an FPV frame is a bottom plate and a top plate on four standoffs, with the flight
 * stack between them.
 */
const Frame = ({ layout }: { layout: DroneLayout }) => {
  const { arm, armHeight, body, build } = layout;
  const material = build === "moulded" ? materials.dronePlastic : materials.carbon;
  const width = ARM_WIDTH[build];
  // Arms start inside the body so they read as one piece with it.
  const root: [number, number] = [body.w * 0.35, body.d * 0.3];

  return (
    <group>
      {build === "moulded" ? (
        <RoundedBox
          args={[body.w, 6, body.d]}
          radius={2.5}
          smoothness={3}
          position={[0, 3, 0]}
          material={material}
          castShadow
          receiveShadow
        />
      ) : (
        <>
          {[PLATE.thickness / 2, PLATE.top].map((y) => (
            <mesh key={y} position={[0, y, 0]} material={material} castShadow receiveShadow>
              <boxGeometry args={[body.w, PLATE.thickness, body.d]} />
            </mesh>
          ))}
          {corners(1).map(([sx, sz]) => (
            <mesh
              key={`${sx},${sz}`}
              position={[sx * (body.w / 2 - 4), PLATE.top / 2, sz * 20]}
              material={materials.lead}
              castShadow
            >
              <cylinderGeometry args={[2.5, 2.5, PLATE.top, 12]} />
            </mesh>
          ))}
        </>
      )}
      {corners(arm).map(([x, z]) => {
        const [fromX, fromZ] = [Math.sign(x) * root[0], Math.sign(z) * root[1]];
        const length = Math.hypot(x - fromX, z - fromZ);
        return (
          <group key={`${x},${z}`}>
            <mesh
              position={[(x + fromX) / 2, armHeight / 2, (z + fromZ) / 2]}
              rotation={[0, -Math.atan2(z - fromZ, x - fromX), 0]}
              material={material}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[length, armHeight, width]} />
            </mesh>
            <mesh position={[x, armHeight / 2, z]} material={material} castShadow>
              <cylinderGeometry
                args={[layout.motor.radius + 2, layout.motor.radius + 2, armHeight, 24]}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

/** A set of four motors, one standing on each arm's mount, with its shaft. */
const Motors = ({ layout }: { layout: DroneLayout }) => {
  const { arm, armHeight, motor, build } = layout;
  const bell = build === "carbon" ? materials.anodised : materials.epoxy;
  return (
    <group>
      {corners(arm).map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, armHeight, z]}>
          <mesh position={[0, motor.height / 2, 0]} material={bell} castShadow receiveShadow>
            <cylinderGeometry args={[motor.radius, motor.radius, motor.height, 32]} />
          </mesh>
          <mesh position={[0, motor.height + 2, 0]} material={materials.lead} castShadow>
            <cylinderGeometry args={[1, 1, 4, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

/**
 * A set of four propellers on the motor shafts, each a hub with thin, slightly pitched blades. Neighbouring
 * propellers turn opposite ways, so their blades are mirrored.
 */
const Propellers = ({ layout }: { layout: DroneLayout }) => {
  const { arm, armHeight, motor, prop } = layout;
  const y = armHeight + motor.height + 1.5;
  const blade = { length: prop.diameter / 2 - 3, chord: prop.diameter / 11, thickness: 0.8 };
  return (
    <group>
      {corners(arm).map(([x, z], i) => {
        const spin = (i === 0 || i === 3 ? 1 : -1) * 0.18;
        return (
          <group key={`${x},${z}`} position={[x, y, z]} rotation={[0, i * 0.7, 0]}>
            <mesh material={materials.epoxy} castShadow>
              <cylinderGeometry args={[3.5, 3.5, 4, 16]} />
            </mesh>
            {Array.from({ length: prop.blades }, (_, b) => (
              <group key={b} rotation={[0, (b * 2 * Math.PI) / prop.blades, 0]}>
                <mesh
                  position={[blade.length / 2 + 2, 0, 0]}
                  rotation={[spin, 0, 0]}
                  material={materials.epoxy}
                  castShadow
                >
                  <boxGeometry args={[blade.length, blade.thickness, blade.chord]} />
                </mesh>
              </group>
            ))}
          </group>
        );
      })}
    </group>
  );
};

/** A drone's frame, motor set or propeller set, drawn to its family's layout. */
export const DroneMesh = ({ footprintId }: { footprintId: string }) => {
  const layout = droneLayoutOf(footprintId);
  if (!layout) return null;
  if (footprintId.startsWith("drone/motors-")) return <Motors layout={layout} />;
  if (footprintId.startsWith("drone/props-")) return <Propellers layout={layout} />;
  return <Frame layout={layout} />;
};
