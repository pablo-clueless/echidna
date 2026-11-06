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
 * The inside of a desktop case or a laptop's bottom shell, a drone's landing pad, or a repair mat, in millimetres: a floor the modules stand on, walls round
 * it, screw bosses in the corners and, for a laptop, the hinge along the back and rubber feet underneath. Unlike a
 * PCB it carries no copper, holes or fiducials, and its size is fixed by the chassis.
 */
export const Chassis = (props: Props) =>
  props.foundation === "drone" ? (
    <LandingPad diameter={CHASSIS.drone.width} thickness={props.thickness} />
  ) : props.foundation === "phone" || props.foundation === "wearable" ? (
    <RepairMat {...CHASSIS[props.foundation]} thickness={props.thickness} />
  ) : (
    <Case {...props} foundation={props.foundation} />
  );

/** Ruler ticks along a repair mat's front edge, in millimetres: a short tick each 5 mm, a long one each 10 mm. */
const RULER = { inset: 6, short: 2, long: 4, stroke: 0.4 } as const;

/**
 * A silicone repair mat a phone or wearable lies on opened up, as in a teardown, with a millimetre ruler printed along
 * its front edge.
 */
const RepairMat = ({
  width,
  depth,
  thickness,
}: {
  width: number;
  depth: number;
  thickness: number;
}) => {
  const geometry = useMemo(
    () =>
      new ExtrudeGeometry(roundedRect(new Shape(), width, depth, 6), {
        depth: thickness,
        bevelEnabled: false,
        curveSegments: 16,
      }),
    [width, depth, thickness],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const ticks = Array.from(
    { length: Math.floor((width - RULER.inset * 4) / 5) + 1 },
    (_, i) => i * 5,
  );
  const start = -(ticks.at(-1) ?? 0) / 2;
  // Far enough above the mat that the markings never flicker into it at a distance.
  const top = thickness + 0.2;
  return (
    <group>
      <mesh
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        material={materials.mat}
        receiveShadow
      />
      {ticks.map((mm) => {
        const length = mm % 10 === 0 ? RULER.long : RULER.short;
        return (
          <mesh
            key={mm}
            position={[start + mm, top, depth / 2 - RULER.inset - length / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={materials.padMarking}
            raycast={() => null}
          >
            <planeGeometry args={[RULER.stroke, length]} />
          </mesh>
        );
      })}
    </group>
  );
};

const Case = ({
  foundation,
  thickness,
}: {
  foundation: Exclude<Foundation, "pcb" | "drone" | "phone" | "wearable">;
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
