"use client";

import { Color, type Group, MeshBasicMaterial, Vector3 } from "three";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Edges } from "@react-three/drei";

import { BOARD, buildSteps, mountingHoles, type Prim, type Role, traces } from "./parts";
import { createPowerUp, FADE_OUT, type Phase } from "./power";
import { useResolvedTheme } from "@/lib/useResolvedTheme";

export type Progress = { active: number; lit: number; phase: Phase };

type Props = {
  callout: RefObject<HTMLDivElement | null>;
  /** Whether the board's power switch is on. Turning it on runs the power-up sequence; off fades the board dark. */
  on: boolean;
  reduced: boolean;
  running: boolean;
  onProgress: (progress: Progress) => void;
};

const ACCENT = "#DE640E";

/**
 * Line-art palettes: every face is filled with the paper colour so it hides the lines behind it, and every edge is
 * drawn in ink, like a technical pen drawing. Solid ink is kept for small details (chip markings, the inductor core).
 */
const palettes = {
  light: { paper: "#F5F5F3", ink: "#1A1A1A" },
  dark: { paper: "#0B0B0B", ink: "#E6E6E2" },
} as const;

type Palette = (typeof palettes)[keyof typeof palettes];

const steps = buildSteps();
const sequence = createPowerUp(steps.length);
const stepIndex = new Map(steps.map((s, i) => [s.key, i]));
const ledIndex = stepIndex.get("led") ?? -1;
const led = steps[ledIndex];

/** Roles drawn as solid ink rather than paper. */
const solid = new Set<Role>(["top"]);

/**
 * Every primitive is drawn as a crisp polyhedron: rounded parts become plain boxes and cylinders get a few facets,
 * so the edge lines alone describe each shape, as in a technical pen drawing.
 */
const PrimMesh = ({ prim, material, ink }: { prim: Prim; material: MeshBasicMaterial; ink: string }) => (
  <mesh position={prim.pos} material={material}>
    {prim.shape === "cyl" ? (
      <cylinderGeometry args={[prim.size[0] / 2, prim.size[0] / 2, prim.size[1], 10]} />
    ) : (
      <boxGeometry args={prim.size} />
    )}
    <Edges threshold={20} color={ink} />
  </mesh>
);

/** Unlit paper fill, pushed back slightly so the ink edges never z-fight with it. */
const paperMaterial = (color: string) =>
  new MeshBasicMaterial({ color, toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });

const useMaterials = (palette: Palette) => {
  const shared = useMemo(() => {
    const make = (role: Role) => paperMaterial(solid.has(role) ? palette.ink : palette.paper);
    return {
      body: make("body"),
      top: make("top"),
      metal: make("metal"),
      gold: make("gold"),
      ceramic: make("ceramic"),
      lens: make("lens"),
      plastic: make("plastic"),
    } satisfies Record<Role, MeshBasicMaterial>;
  }, [palette]);

  const accents = useMemo(
    () => steps.map((step) => shared[step.prims.find((p) => p.accent)?.role ?? "body"].clone()),
    [shared],
  );

  const board = useMemo(
    () => ({
      board: paperMaterial(palette.paper),
      hole: paperMaterial(palette.paper),
      /** One trace material per part, so each run of copper lights with the part it feeds. */
      traces: steps.map(() => paperMaterial(palette.paper)),
      halo: new MeshBasicMaterial({ color: ACCENT, toneMapped: false, transparent: true, opacity: 0, depthWrite: false }),
    }),
    [palette],
  );

  useEffect(
    () => () => {
      for (const m of [...Object.values(shared), ...accents, board.board, board.hole, board.halo, ...board.traces])
        m.dispose();
    },
    [shared, accents, board],
  );

  return { shared, accents, board };
};

const Rig = ({ callout, on, reduced, onProgress }: Omit<Props, "running">) => {
  const palette = palettes[useResolvedTheme()];
  const { shared, accents, board } = useMaterials(palette);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  const root = useRef<Group>(null);
  const anchor = useMemo(() => new Vector3(), []);
  /** Seconds since the switch was last turned on. */
  const time = useRef(on ? sequence.settled : 0);
  /** 1 while powered, falling to 0 as the board goes dark after the switch is turned off. */
  const fade = useRef(on ? 1 : 0);
  const last = useRef<Progress | null>(null);
  const accent = useMemo(() => new Color(ACCENT), []);
  const paper = useMemo(() => new Color(palette.paper), [palette]);
  const bases = useMemo(() => accents.map((m) => m.color.clone()), [accents]);

  useEffect(() => {
    camera.zoom = Math.min(size.width / 8.6, size.height / 5.4);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size, invalidate]);

  useEffect(() => {
    if (on) {
      time.current = reduced ? sequence.settled : 0;
      fade.current = 1;
    } else if (reduced) {
      fade.current = 0;
    }
    invalidate();
  }, [on, reduced, invalidate, palette]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    if (on) time.current = Math.min(sequence.settled, time.current + (reduced ? 0 : dt));
    else fade.current = reduced ? 0 : Math.max(0, fade.current - dt / FADE_OUT);
    const t = time.current;
    const f = fade.current;
    const clock = state.clock.elapsedTime;

    if (root.current) root.current.rotation.y = reduced ? 0 : Math.sin(clock * 0.22) * 0.1;
    const pulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(clock * 3.2);

    const levels = steps.map((_, i) => {
      const { level, flash } = sequence.stepAt(t, i);
      const lit = level * f;
      const material = accents[i];
      const base = bases[i];
      if (material && base) material.color.copy(base).lerp(accent, (on ? flash : 0) * 0.92);
      board.traces[i]?.color.copy(paper).lerp(accent, lit * pulse);
      return lit;
    });

    const ledLevel = levels[ledIndex] ?? 0;
    shared.lens.color.copy(paper).lerp(accent, ledLevel);
    board.halo.opacity = ledLevel * (reduced ? 0.3 : 0.22 + 0.1 * Math.sin(clock * 3.2));

    const active = on && !reduced ? sequence.activeStepAt(t) : -1;
    const node = callout.current;
    const step = steps[active];
    if (node) {
      node.style.opacity = step ? "1" : "0";
      if (step && root.current) {
        anchor.set(step.centre[0], step.centre[1] + 0.75, step.centre[2]);
        root.current.localToWorld(anchor).project(camera);
        const x = Math.min(size.width - 80, Math.max(80, ((anchor.x + 1) / 2) * size.width));
        const y = ((1 - anchor.y) / 2) * size.height;
        node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      }
    }

    const progress: Progress = on
      ? { active, lit: sequence.litAt(t), phase: sequence.phaseAt(t) }
      : { active: -1, lit: 0, phase: "off" };
    const prev = last.current;
    if (!prev || prev.active !== progress.active || prev.lit !== progress.lit || prev.phase !== progress.phase) {
      last.current = progress;
      onProgress(progress);
    }
  });

  return (
    <group ref={root} position={[0.15, 0, 0.55]}>
      <mesh position={[0, BOARD.thickness / 2, 0]} material={board.board}>
        <boxGeometry args={[BOARD.width, BOARD.thickness, BOARD.depth]} />
        <Edges color={palette.ink} />
      </mesh>
      {traces.map(({ from: [x1, z1], to: [x2, z2], step }) => {
        const length = Math.hypot(x2 - x1, z2 - z1) + 0.07;
        return (
          <mesh
            key={`${x1},${z1},${x2},${z2}`}
            position={[(x1 + x2) / 2, BOARD.thickness + 0.003, (z1 + z2) / 2]}
            rotation={[0, -Math.atan2(z2 - z1, x2 - x1), 0]}
            material={board.traces[stepIndex.get(step) ?? 0] ?? board.board}
          >
            <boxGeometry args={[length, 0.006, 0.07]} />
            <Edges color={palette.ink} />
          </mesh>
        );
      })}
      {mountingHoles.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, BOARD.thickness + 0.002, z]} material={board.hole}>
          <cylinderGeometry args={[0.13, 0.13, 0.006, 32]} />
          <Edges color={palette.ink} />
        </mesh>
      ))}

      {steps.map((step, i) => (
        <group key={step.key} position={step.centre}>
          {step.prims.map((prim, j) => (
            <PrimMesh
              key={j}
              prim={prim}
              ink={palette.ink}
              material={prim.accent ? (accents[i] ?? shared[prim.role]) : shared[prim.role]}
            />
          ))}
        </group>
      ))}

      {led && (
        <mesh
          position={[led.centre[0], led.centre[1] + 0.01, led.centre[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={board.halo}
          renderOrder={1}
        >
          <circleGeometry args={[0.42, 32]} />
        </mesh>
      )}
    </group>
  );
};

export const AssemblyScene = ({ running, ...props }: Props) => (
  <Canvas
    orthographic
    flat
    camera={{ position: [7, 6.2, 7], zoom: 60, near: 0.1, far: 100 }}
    gl={{ alpha: true, antialias: true }}
    dpr={[1, 2]}
    frameloop={props.reduced ? "demand" : running ? "always" : "never"}
  >
    <Rig {...props} />
  </Canvas>
);
