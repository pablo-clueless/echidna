"use client";

import { CanvasTexture, Color, type Group, MeshStandardMaterial, type PointLight, Vector3 } from "three";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";

import { BOARD, buildSteps, mountingHoles, type Prim, type Role, traces } from "./parts";
import { createTimeline, easeInCubic, easeOutBack, type Phase } from "./timeline";
import { useResolvedTheme } from "@/lib/useResolvedTheme";

export type Progress = { active: number; placed: number; phase: Phase };

type Props = {
  callout: RefObject<HTMLDivElement | null>;
  reduced: boolean;
  running: boolean;
  onProgress: (progress: Progress) => void;
};

const ACCENT = "#DE640E";
const DROP_HEIGHT = 3.4;
const LIFT_HEIGHT = 4.5;

const palettes = {
  light: {
    board: "#ECE6DC",
    trace: "#D9CFBF",
    hole: "#CFC5B5",
    body: "#3B3940",
    top: "#57545C",
    metal: "#C9C5BE",
    gold: "#C9A85C",
    ceramic: "#C7B494",
    lens: "#F6F2EA",
    plastic: "#F1EDE6",
    shadow: "#6B5A45",
  },
  dark: {
    board: "#2B2930",
    trace: "#3A3740",
    hole: "#1D1C21",
    body: "#141317",
    top: "#28262C",
    metal: "#8E8A93",
    gold: "#A88A48",
    ceramic: "#7A6C58",
    lens: "#D9D4CC",
    plastic: "#C9C4BC",
    shadow: "#000000",
  },
} as const;

type Palette = (typeof palettes)[keyof typeof palettes];

const steps = buildSteps();
const timeline = createTimeline(steps.length);
const STILL_TIME = timeline.assembled + 1;
const ledStep = steps.findIndex((s) => s.key === "led");
const ledCentre = steps[ledStep]?.centre ?? [0, 0, 0];

const makeShadow = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 300;
  canvas.height = 213;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.filter = "blur(14px)";
    ctx.fillStyle = "#fff";
    ctx.fillRect(50, 40, 200, 133);
  }
  return new CanvasTexture(canvas);
};

const PrimMesh = ({ prim, material }: { prim: Prim; material: MeshStandardMaterial }) => {
  if (prim.shape === "round") {
    return (
      <RoundedBox args={prim.size} radius={Math.min(...prim.size) * 0.2} smoothness={3} position={prim.pos} material={material} />
    );
  }
  return (
    <mesh position={prim.pos} material={material}>
      {prim.shape === "cyl" ? (
        <cylinderGeometry args={[prim.size[0] / 2, prim.size[0] / 2, prim.size[1], 24]} />
      ) : (
        <boxGeometry args={prim.size} />
      )}
    </mesh>
  );
};

const useMaterials = (palette: Palette) => {
  const shared = useMemo(() => {
    const make = (role: Role) =>
      new MeshStandardMaterial({
        color: palette[role],
        roughness: role === "metal" || role === "gold" ? 0.45 : 0.75,
        metalness: role === "metal" || role === "gold" ? 0.35 : 0,
      });
    return {
      body: make("body"),
      top: make("top"),
      metal: make("metal"),
      gold: make("gold"),
      ceramic: make("ceramic"),
      lens: make("lens"),
      plastic: make("plastic"),
    } satisfies Record<Role, MeshStandardMaterial>;
  }, [palette]);

  const accents = useMemo(
    () => steps.map((step) => shared[step.prims.find((p) => p.accent)?.role ?? "body"].clone()),
    [shared],
  );

  const board = useMemo(
    () => ({
      board: new MeshStandardMaterial({ color: palette.board, roughness: 0.9 }),
      trace: new MeshStandardMaterial({ color: palette.trace, roughness: 0.8, emissive: ACCENT, emissiveIntensity: 0 }),
      hole: new MeshStandardMaterial({ color: palette.hole, roughness: 1 }),
    }),
    [palette],
  );

  useEffect(
    () => () => {
      for (const m of [...Object.values(shared), ...accents, ...Object.values(board)]) m.dispose();
    },
    [shared, accents, board],
  );

  return { shared, accents, board };
};

const Rig = ({ callout, reduced, onProgress }: Omit<Props, "running">) => {
  const palette = palettes[useResolvedTheme()];
  const { shared, accents, board } = useMaterials(palette);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  const root = useRef<Group>(null);
  const groups = useRef<(Group | null)[]>([]);
  const anchor = useMemo(() => new Vector3(), []);
  const ledLight = useRef<PointLight>(null);
  const time = useRef(reduced ? STILL_TIME : 0);
  const last = useRef<Progress | null>(null);
  const accent = useMemo(() => new Color(ACCENT), []);
  const shadow = useMemo(() => makeShadow(), []);
  useEffect(() => () => shadow.dispose(), [shadow]);
  const bases = useMemo(() => accents.map((m) => m.color.clone()), [accents]);

  useEffect(() => {
    camera.zoom = Math.min(size.width / 8.6, size.height / 5.4);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size, invalidate]);

  useEffect(() => {
    if (reduced) time.current = STILL_TIME;
    invalidate();
  }, [reduced, invalidate, palette]);

  useFrame((state, delta) => {
    if (!reduced) time.current = (time.current + Math.min(delta, 0.1)) % timeline.cycle;
    const t = time.current;
    const clock = state.clock.elapsedTime;

    if (root.current) root.current.rotation.y = reduced ? 0 : Math.sin(clock * 0.22) * 0.1;

    steps.forEach((step, i) => {
      const group = groups.current[i];
      if (!group) return;
      const { drop, lift, highlight } = timeline.stepAt(t, i);
      const visible = drop > 0 && lift < 1;
      group.visible = visible;
      if (!visible) return;
      const fall = 1 - easeOutBack(drop);
      const rise = easeInCubic(lift);
      const [cx, cy, cz] = step.centre;
      group.position.set(cx * (1 + rise * 0.5), cy + fall * DROP_HEIGHT + rise * LIFT_HEIGHT, cz * (1 + rise * 0.5));
      group.rotation.y = fall * 0.5 - rise * 0.6;
      group.scale.setScalar(1 - rise * 0.6);
      const material = accents[i];
      const base = bases[i];
      if (material && base) material.color.copy(base).lerp(accent, highlight * 0.92);
    });

    const power = timeline.powerAt(t);
    board.trace.emissiveIntensity = power * (reduced ? 0.35 : 0.5 + 0.25 * Math.sin(clock * 3.2));
    shared.lens.emissive.set(power > 0 ? "#FFE6BF" : "#000000");
    shared.lens.emissiveIntensity = power * 1.4;
    if (ledLight.current) ledLight.current.intensity = power * 2.2;

    const active = timeline.activeStepAt(t);
    const node = callout.current;
    const step = steps[active];
    if (node) {
      node.style.opacity = step && !reduced ? "1" : "0";
      if (step && root.current) {
        anchor.set(step.centre[0], step.centre[1] + 0.75, step.centre[2]);
        root.current.localToWorld(anchor).project(camera);
        const x = Math.min(size.width - 80, Math.max(80, ((anchor.x + 1) / 2) * size.width));
        const y = ((1 - anchor.y) / 2) * size.height;
        node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      }
    }

    const progress: Progress = { active, placed: timeline.placedAt(t), phase: timeline.phaseAt(t) };
    const prev = last.current;
    if (!prev || prev.active !== progress.active || prev.placed !== progress.placed || prev.phase !== progress.phase) {
      last.current = progress;
      onProgress(progress);
    }
  });

  return (
    <group ref={root} position={[0.15, 0, 0.55]}>
      <mesh position={[0, BOARD.thickness / 2, 0]} material={board.board}>
        <boxGeometry args={[BOARD.width, BOARD.thickness, BOARD.depth]} />
      </mesh>
      {traces.map(([x1, z1, x2, z2]) => {
        const length = Math.hypot(x2 - x1, z2 - z1) + 0.06;
        return (
          <mesh
            key={`${x1},${z1},${x2},${z2}`}
            position={[(x1 + x2) / 2, BOARD.thickness + 0.003, (z1 + z2) / 2]}
            rotation={[0, -Math.atan2(z2 - z1, x2 - x1), 0]}
            material={board.trace}
          >
            <boxGeometry args={[length, 0.006, 0.06]} />
          </mesh>
        );
      })}
      {mountingHoles.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, BOARD.thickness + 0.002, z]} material={board.hole}>
          <cylinderGeometry args={[0.13, 0.13, 0.006, 32]} />
        </mesh>
      ))}

      {steps.map((step, i) => (
        <group
          key={step.key}
          ref={(g) => {
            groups.current[i] = g;
          }}
          visible={false}
        >
          {step.prims.map((prim, j) => (
            <PrimMesh key={j} prim={prim} material={prim.accent ? (accents[i] ?? shared[prim.role]) : shared[prim.role]} />
          ))}
        </group>
      ))}

      <pointLight
        ref={ledLight}
        position={[ledCentre[0], ledCentre[1] + 0.35, ledCentre[2]]}
        color="#FFD9A8"
        intensity={0}
        distance={2.2}
        decay={1.6}
      />

      <mesh position={[0.25, -0.005, 0.35]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOARD.width * 1.5, BOARD.depth * 1.6]} />
        <meshBasicMaterial map={shadow} color={palette.shadow} transparent opacity={0.45} depthWrite={false} />
      </mesh>
    </group>
  );
};

export const AssemblyScene = ({ running, ...props }: Props) => (
  <Canvas
    orthographic
    camera={{ position: [7, 6.2, 7], zoom: 60, near: 0.1, far: 100 }}
    gl={{ alpha: true, antialias: true }}
    dpr={[1, 2]}
    frameloop={props.reduced ? "demand" : running ? "always" : "never"}
  >
    <ambientLight intensity={1.6} />
    <hemisphereLight args={["#FFFFFF", "#8A7A66", 0.6]} />
    <directionalLight position={[-4, 9, 5]} intensity={1.6} />
    <Rig {...props} />
  </Canvas>
);
