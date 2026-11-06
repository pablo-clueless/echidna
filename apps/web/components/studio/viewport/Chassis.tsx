"use client";

import { ExtrudeGeometry, Path, Shape } from "three";
import { useEffect, useMemo } from "react";

import { CHASSIS, type Foundation } from "@/lib/project/foundation";
import { mountingHoles } from "@/lib/board/placement";
import { materials } from "./materials";

type Props = {
  foundation: Exclude<Foundation, "pcb">;
  /** Floor thickness in millimetres; parts stand on its top face, as they would on a PCB. */
  thickness: number;
};

/** Side wall thickness, in millimetres. */
const WALL = 1.5;
const BOSS = { radius: 2.4, hole: 1.1, height: 3 };
const FOOT = { radius: 3, height: 1.2, inset: 12 };

/** Traces a rectangle with rounded corners, centred on the origin, into a shape or a hole. */
const roundedRect = <T extends Shape | Path>(
  path: T,
  width: number,
  depth: number,
  r: number,
): T => {
  const [w, d] = [width / 2, depth / 2];
  path.moveTo(-w + r, -d);
  path.lineTo(w - r, -d);
  path.quadraticCurveTo(w, -d, w, -d + r);
  path.lineTo(w, d - r);
  path.quadraticCurveTo(w, d, w - r, d);
  path.lineTo(-w + r, d);
  path.quadraticCurveTo(-w, d, -w, d - r);
  path.lineTo(-w, -d + r);
  path.quadraticCurveTo(-w, -d, -w + r, -d);
  return path;
};

/** The ring and letter painted on a landing pad, in millimetres. */
const PAD = { ring: 6, inset: 14, letter: { height: 110, stroke: 16, width: 70 } } as const;

/**
 * A round rubber landing pad a drone stands on, in millimetres, with a ring round its edge and a large H in the
 * middle like a helipad's. It has no walls, so the propellers are never hidden.
 */
const LandingPad = ({ diameter, thickness }: { diameter: number; thickness: number }) => {
  const r = diameter / 2;
  const { letter } = PAD;
  // Far enough above the pad that the markings never flicker into it at a distance.
  const top = thickness + 0.4;
  return (
    <group>
      <mesh position={[0, thickness / 2, 0]} material={materials.rubber} receiveShadow castShadow>
        <cylinderGeometry args={[r, r, thickness, 96]} />
      </mesh>
      <mesh position={[0, top, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.padMarking}>
        <ringGeometry args={[r - PAD.inset - PAD.ring, r - PAD.inset, 96]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[(side * (letter.width - letter.stroke)) / 2, top, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={materials.padMarking}
        >
          <planeGeometry args={[letter.stroke, letter.height]} />
        </mesh>
      ))}
      <mesh position={[0, top, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.padMarking}>
        <planeGeometry args={[letter.width - letter.stroke, letter.stroke]} />
      </mesh>
    </group>
  );
};

/**
 * The inside of a desktop case or a laptop's bottom shell, or a drone's landing pad, in millimetres: a floor the modules stand on, walls round
 * it, screw bosses in the corners and, for a laptop, the hinge along the back and rubber feet underneath. Unlike a
 * PCB it carries no copper, holes or fiducials, and its size is fixed by the chassis.
 */
export const Chassis = (props: Props) =>
  props.foundation === "drone" ? (
    <LandingPad diameter={CHASSIS.drone.width} thickness={props.thickness} />
  ) : (
    <Case {...props} foundation={props.foundation} />
  );

const Case = ({
  foundation,
  thickness,
}: {
  foundation: Exclude<Foundation, "pcb" | "drone">;
  thickness: number;
}) => {
  const { width, depth, wall } = CHASSIS[foundation];
  const material = foundation === "laptop" ? materials.anodised : materials.caseSteel;
  const corner = foundation === "laptop" ? 8 : 3;

  const floor = useMemo(
    () =>
      new ExtrudeGeometry(roundedRect(new Shape(), width, depth, corner), {
        depth: thickness,
        bevelEnabled: false,
        curveSegments: 24,
      }),
    [width, depth, corner, thickness],
  );
  const walls = useMemo(() => {
    const outer = roundedRect(new Shape(), width, depth, corner);
    outer.holes.push(roundedRect(new Path(), width - WALL * 2, depth - WALL * 2, corner - WALL));
    return new ExtrudeGeometry(outer, { depth: wall, bevelEnabled: false, curveSegments: 24 });
  }, [width, depth, corner, wall]);
  useEffect(
    () => () => {
      floor.dispose();
      walls.dispose();
    },
    [floor, walls],
  );

  const bosses = mountingHoles({ width: width - WALL * 2, depth: depth - WALL * 2 });
  const feet = mountingHoles({ width: width - FOOT.inset, depth: depth - FOOT.inset });

  return (
    <group>
      <mesh
        geometry={floor}
        rotation={[-Math.PI / 2, 0, 0]}
        material={material}
        receiveShadow
        castShadow
      />
      <mesh
        geometry={walls}
        rotation={[-Math.PI / 2, 0, 0]}
        material={material}
        receiveShadow
        castShadow
        raycast={() => null}
      />
      {bosses.map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, thickness, z]}>
          <mesh position={[0, BOSS.height / 2, 0]} material={material} castShadow receiveShadow>
            <cylinderGeometry args={[BOSS.radius, BOSS.radius, BOSS.height, 24]} />
          </mesh>
          <mesh
            position={[0, BOSS.height + 0.01, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={materials.cavity}
          >
            <circleGeometry args={[BOSS.hole, 20]} />
          </mesh>
        </group>
      ))}
      {foundation === "laptop" && (
        <>
          <mesh
            position={[0, wall / 2, -depth / 2]}
            rotation={[0, 0, Math.PI / 2]}
            material={materials.rubber}
            castShadow
            raycast={() => null}
          >
            <cylinderGeometry args={[wall / 2 + 0.6, wall / 2 + 0.6, width * 0.7, 24]} />
          </mesh>
          {feet.map(([x, z]) => (
            <mesh
              key={`${x},${z}`}
              position={[x, -FOOT.height / 2, z]}
              material={materials.rubber}
              raycast={() => null}
            >
              <cylinderGeometry args={[FOOT.radius, FOOT.radius, FOOT.height, 24]} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
};
