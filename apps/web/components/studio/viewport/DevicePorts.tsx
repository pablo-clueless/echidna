"use client";

import { RoundedBox } from "@react-three/drei";
import type { ReactNode } from "react";

import { materials } from "./materials";

/**
 * The ports and keys on a device's outside: sockets cut through its wall, and the buttons standing proud of it.
 * Everything is in millimetres, centred on the device, x across it and z towards the viewer; walls stand on y = 0.
 */

/** Which face of the device a port or key is on: its left or right side, or its front or back. */
type Face = "left" | "right" | "front" | "back";

/** A port's opening: a USB-C stadium, a rectangular USB-A or HDMI socket, or a round audio jack. */
type Socket = "usbC" | "usbA" | "hdmi" | "jack" | "rj45";

/** Outer size of each socket's opening, across the wall and up it, in millimetres. */
const SOCKETS: Record<Socket, { w: number; h: number }> = {
  usbC: { w: 8.9, h: 3.2 },
  usbA: { w: 12.5, h: 5 },
  hdmi: { w: 15, h: 5.5 },
  jack: { w: 3.5, h: 3.5 },
  rj45: { w: 16, h: 13.5 },
};

/** Turns a face's local frame, x along the wall and z out of it, into the device's. */
const faceRotation: Record<Face, number> = {
  front: 0,
  right: Math.PI / 2,
  back: Math.PI,
  left: -Math.PI / 2,
};

type Placement = {
  face: Face;
  /** Distance of the wall's outer face from the device's centre. */
  reach: number;
  /** Position along the wall, from its middle, left to right seen from outside. */
  along: number;
  /** Height of the centre above the bottom of the wall. */
  y: number;
};

/** Places its children on a wall: x along it, y up, z out through it, with z = 0 on the outer face. */
const OnFace = ({ face, reach, along, y, children }: Placement & { children: ReactNode }) => (
  <group rotation={[0, faceRotation[face], 0]}>
    <group position={[along, y, reach]}>{children}</group>
  </group>
);

/**
 * A socket cut through a wall: the dark opening on the outer face and, for USB, the tongue inside it.
 * @param wall - How thick the wall is, which the opening runs through.
 */
export const Port = ({ socket, wall, ...at }: Placement & { socket: Socket; wall: number }) => {
  const { w, h } = SOCKETS[socket];
  const depth = wall + 0.2;
  return (
    <OnFace {...at}>
      {socket === "jack" ? (
        <mesh
          position={[0, 0, -wall / 2]}
          rotation={[Math.PI / 2, 0, 0]}
          material={materials.cavity}
          raycast={() => null}
        >
          <cylinderGeometry args={[w / 2, w / 2, depth, 20]} />
        </mesh>
      ) : (
        <RoundedBox
          args={[w, h, depth]}
          radius={socket === "usbC" ? h / 2 - 0.01 : 0.3}
          smoothness={socket === "usbC" ? 6 : 2}
          position={[0, 0, -wall / 2]}
          material={materials.cavity}
          raycast={() => null}
        />
      )}
      {(socket === "usbA" || socket === "usbC") && (
        <mesh
          position={[0, socket === "usbA" ? 0.9 : 0, -wall / 2 - 0.1]}
          material={materials.plastic}
          raycast={() => null}
        >
          <boxGeometry
            args={[w - (socket === "usbA" ? 1.5 : 2.6), socket === "usbA" ? 1.6 : 0.7, depth]}
          />
        </mesh>
      )}
      {socket === "rj45" && (
        <mesh position={[0, -h / 2 + 1, -wall / 2]} material={materials.gold} raycast={() => null}>
          <boxGeometry args={[w - 4, 0.4, depth]} />
        </mesh>
      )}
    </OnFace>
  );
};

/** A key standing proud of a wall: a rounded bar, such as a phone's power key. */
export const Key = ({
  length,
  height,
  proud = 0.5,
  material = materials.anodised,
  ...at
}: Placement & {
  length: number;
  height: number;
  proud?: number;
  material?: typeof materials.anodised;
}) => (
  <OnFace {...at}>
    <RoundedBox
      args={[length, height, proud + 0.6]}
      radius={Math.min(height, proud + 0.6) / 2 - 0.01}
      smoothness={3}
      position={[0, 0, (proud - 0.6) / 2]}
      material={material}
      castShadow
      raycast={() => null}
    />
  </OnFace>
);

/** A round button standing proud of a wall, such as a desktop's power button or a watch's crown. */
export const RoundButton = ({
  radius,
  proud,
  material = materials.anodised,
  ...at
}: Placement & { radius: number; proud: number; material?: typeof materials.anodised }) => (
  <OnFace {...at}>
    <mesh
      position={[0, 0, proud / 2]}
      rotation={[Math.PI / 2, 0, 0]}
      material={material}
      castShadow
      raycast={() => null}
    >
      <cylinderGeometry args={[radius, radius, proud, 32]} />
    </mesh>
  </OnFace>
);

/** A row of small round holes through a wall, such as a phone's speaker grille. */
export const Grille = ({
  holes,
  pitch,
  radius,
  wall,
  ...at
}: Placement & { holes: number; pitch: number; radius: number; wall: number }) => (
  <OnFace {...at}>
    {Array.from({ length: holes }, (_, i) => (
      <mesh
        key={i}
        position={[(i - (holes - 1) / 2) * pitch, 0, -wall / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        material={materials.cavity}
        raycast={() => null}
      >
        <cylinderGeometry args={[radius, radius, wall + 0.2, 12]} />
      </mesh>
    ))}
  </OnFace>
);

/**
 * A phone's keys and ports, in its frame's rails: the side key on the right, the action and volume keys on the left,
 * and the USB-C port between the speaker and microphone holes along the bottom.
 */
export const PhoneKeysAndPorts = ({
  width,
  depth,
  height,
  rail,
}: {
  width: number;
  depth: number;
  height: number;
  rail: number;
}) => {
  const y = height * 0.52;
  const side = { reach: width / 2, y };
  const bottom = { face: "front" as const, reach: depth / 2, y };
  return (
    <group>
      {/* Seen from outside the right rail, "along" runs from the bottom of the phone to the top. */}
      <Key face="right" {...side} along={depth * 0.2} length={16} height={2.6} />
      <Key face="left" {...side} along={-depth * 0.32} length={6} height={2.4} />
      <Key face="left" {...side} along={-depth * 0.23} length={10} height={2.4} />
      <Key face="left" {...side} along={-depth * 0.14} length={10} height={2.4} />
      <Port {...bottom} along={0} socket="usbC" wall={rail} />
      {/* The receptacle's steel shell, inside the frame behind the opening. */}
      <mesh
        position={[0, y, depth / 2 - rail - 3.4]}
        material={materials.caseSteel}
        raycast={() => null}
      >
        <boxGeometry args={[8.6, 3, 6.8]} />
      </mesh>
      <Grille {...bottom} along={13} holes={6} pitch={2.1} radius={0.55} wall={rail} />
      <Grille {...bottom} along={-13} holes={4} pitch={2.1} radius={0.55} wall={rail} />
    </group>
  );
};

/** A smartwatch's crown and side button, on its right; a fitness band's single button. */
export const WearableKeys = ({
  width,
  depth,
  height,
  watch,
}: {
  width: number;
  depth: number;
  height: number;
  watch: boolean;
}) => {
  const at = { face: "right" as const, reach: width / 2, y: height * 0.55 };
  if (!watch) return <Key {...at} along={0} length={6} height={2.4} proud={0.4} />;
  return (
    <group>
      <RoundButton {...at} along={depth * 0.12} radius={3.2} proud={2.6} />
      <Key {...at} along={-depth * 0.18} length={8} height={2.6} proud={0.6} />
    </group>
  );
};

/** A laptop's ports through the side walls of its base: USB-C on the left, USB-A, HDMI and audio on the right. */
export const LaptopPorts = ({
  width,
  wall,
  thickness,
  height,
}: {
  width: number;
  wall: number;
  thickness: number;
  height: number;
}) => {
  const y = thickness + (height - thickness) * 0.48;
  const left = { face: "left" as const, reach: width / 2, y };
  const right = { face: "right" as const, reach: width / 2, y };
  // "along" on the left wall runs from the back, where the hinge is, to the front; on the right, front to back.
  return (
    <group>
      <Port {...left} along={-70} socket="usbC" wall={wall} />
      <Port {...left} along={-55} socket="usbC" wall={wall} />
      <Port {...left} along={-25} socket="jack" wall={wall} />
      <Port {...right} along={-72} socket="usbA" wall={wall} />
      <Port {...right} along={-50} socket="hdmi" wall={wall} />
      <Port {...right} along={-28} socket="usbA" wall={wall} />
    </group>
  );
};

/** Pitch of a desktop's expansion slots, in millimetres. */
const SLOT_PITCH = 20.32;

/**
 * A desktop's front panel (power button, USB and audio) and, at the back, the motherboard's I/O shield with its ports
 * and the expansion slot covers beside it.
 * @param mount - Where the motherboard's centre is screwed down, which the I/O shield lines up with.
 */
export const DesktopPorts = ({
  width,
  depth,
  wall,
  thickness,
  height,
  mount,
}: {
  width: number;
  depth: number;
  wall: number;
  thickness: number;
  height: number;
  mount: { x: number; z: number };
}) => {
  const y = thickness + (height - thickness) / 2;
  const front = { face: "front" as const, reach: depth / 2, y };
  const back = { face: "back" as const, reach: depth / 2 };
  // An ATX board's rear edge has the I/O ports along its left 158.75 mm. Seen from behind, "along" runs the other
  // way to x, so the shield's centre is at minus its x.
  const shieldX = mount.x - 305 / 2 + 158.75 / 2;
  const shieldH = Math.min(44.45, height - thickness - 4);
  const ports: [number, number, Socket][] = [
    [-60, 5, "usbA"],
    [-60, -5, "usbA"],
    [-38, 5, "usbA"],
    [-38, -5, "usbA"],
    [-14, 0, "rj45"],
    [10, 5, "usbC"],
    [10, -5, "usbA"],
    [30, 0, "hdmi"],
    [52, 8, "jack"],
    [52, 0, "jack"],
    [52, -8, "jack"],
  ];
  return (
    <group>
      <RoundButton {...front} along={width / 2 - 40} radius={6} proud={1.6} />
      <mesh
        position={[width / 2 - 40, y - 9, depth / 2 + 0.05]}
        material={materials.lens}
        raycast={() => null}
      >
        <circleGeometry args={[0.8, 16]} />
      </mesh>
      <Port {...front} along={width / 2 - 70} socket="usbA" wall={1.5} />
      <Port {...front} along={width / 2 - 86} socket="usbA" wall={1.5} />
      <Port {...front} along={width / 2 - 101} socket="usbC" wall={1.5} />
      <Port {...front} along={width / 2 - 113} socket="jack" wall={1.5} />
      {/* Thinner than the openings stand out of the wall, so the ports show through it. */}
      <OnFace {...back} along={-shieldX} y={y}>
        <mesh position={[0, 0, 0.03]} material={materials.anodised} raycast={() => null}>
          <boxGeometry args={[158.75, shieldH, 0.06]} />
        </mesh>
      </OnFace>
      {ports.map(([along, dy, socket]) => (
        <Port
          key={`${along},${dy}`}
          {...back}
          along={-shieldX + (along * 158.75) / 140}
          y={y + dy * (shieldH / 44.45)}
          socket={socket}
          wall={wall}
        />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <OnFace key={i} {...back} along={-(shieldX + 158.75 / 2 + 14 + i * SLOT_PITCH)} y={y}>
          <mesh position={[0, 0, 0.2]} material={materials.caseSteel} raycast={() => null}>
            <boxGeometry args={[14, shieldH, 0.4]} />
          </mesh>
          {Array.from({ length: 5 }, (_, j) => (
            <mesh
              key={j}
              position={[0, (j - 2) * (shieldH / 6), 0.41]}
              material={materials.cavity}
              raycast={() => null}
            >
              <boxGeometry args={[9, 1.2, 0.05]} />
            </mesh>
          ))}
        </OnFace>
      ))}
    </group>
  );
};
