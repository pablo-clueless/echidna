"use client";

import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { Environment, Grid, Lightformer } from "@react-three/drei";
import { partsById } from "@echidna/library";
import { useEffect, useState } from "react";

import { footprints, resistorBands } from "@/lib/board/footprints";
import { useResolvedTheme } from "@/lib/useResolvedTheme";
import { useProjectStore } from "@/stores/project";
import { paramValue } from "@/lib/project/model";
import { useStudioStore } from "@/stores/studio";
import { Footprint } from "./viewport/Footprint";
import { CameraRig } from "./viewport/CameraRig";
import { PartMesh } from "./viewport/PartMesh";
import { Board } from "./viewport/Board";

/** Board size in millimetres: 100 × 70 mm, 1.6 mm FR-4. Placements in the store are in metres. */
const BOARD = { width: 100, depth: 70, thickness: 1.6 };
const MM = 0.001;
const TOP = BOARD.thickness * MM;
/** Slightly inside the board's half-diagonal, so "fit" fills the view without cropping the corners in a wide panel. */
const FRAME_RADIUS = 0.052;
const EDGE_MARGIN = 0.004;
const SNAP = 0.0005;
const LED_NOMINAL_CURRENT = 0.02;

const gridColours = {
  light: { cell: "#E9DFCF", section: "#D2C4AE" },
  dark: { cell: "#1C1B1F", section: "#2C2A30" },
} as const;

/** Outline colours: selection uses the brand orange; issues use status colours, never orange. */
const highlights = { selected: "#DE640E", fail: "#D92D20", warn: "#EAB308" } as const;

const snap = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v / SNAP) * SNAP));

/** The page's monospace face, once loaded, so silkscreen matches the rest of the studio. */
const useMonoFont = () => {
  const [family, setFamily] = useState("ui-monospace, monospace");
  useEffect(() => {
    let live = true;
    const value = getComputedStyle(document.body).getPropertyValue("--font-mono").trim();
    void document.fonts.ready.then(() => {
      if (live && value) setFamily(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return family;
};

/** Studio lighting baked into an environment map: a large soft key overhead and strip lights for edge highlights. */
/** Exposes the scene to `window.__echidna.three` in development, for inspecting the camera and renderer. */
const DevHandle = () => {
  const get = useThree((s) => s.get);
  useEffect(() => {
    if (process.env.NODE_ENV === "development") window.__echidna = { ...window.__echidna, three: get };
  }, [get]);
  return null;
};

const StudioLighting = () => (
  <>
    <Environment resolution={256} frames={1} environmentIntensity={0.9}>
      <color attach="background" args={["#303136"]} />
      <Lightformer form="rect" intensity={3} position={[0, 2, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[3, 3, 1]} />
      <Lightformer form="rect" intensity={1.4} position={[0, 1.1, -2]} scale={[5, 1.6, 1]} />
      <Lightformer form="rect" intensity={0.7} position={[0, 1.1, 2]} rotation={[0, Math.PI, 0]} scale={[5, 1.2, 1]} />
      <Lightformer form="rect" intensity={1.6} position={[-2, 0.6, 0.5]} rotation={[0, Math.PI / 2, 0]} scale={[4, 0.5, 1]} />
      <Lightformer form="rect" intensity={1.2} position={[2, 0.8, -0.5]} rotation={[0, -Math.PI / 2, 0]} scale={[4, 0.4, 1]} />
    </Environment>
    <ambientLight intensity={0.15} />
    <directionalLight
      position={[0.12, 0.3, 0.16]}
      intensity={1.6}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0002}
      shadow-normalBias={0.00004}
      shadow-camera-left={-0.07}
      shadow-camera-right={0.07}
      shadow-camera-top={0.07}
      shadow-camera-bottom={-0.07}
      shadow-camera-near={0.1}
      shadow-camera-far={0.6}
    />
  </>
);

export const ViewportCanvas = () => {
  const colours = gridColours[useResolvedTheme()];
  const fontFamily = useMonoFont();
  const components = useProjectStore((s) => s.components);
  const board = useProjectStore((s) => s.board);
  const placeOnBoard = useProjectStore((s) => s.placeOnBoard);
  const selection = useStudioStore((s) => s.selection);
  const select = useStudioStore((s) => s.select);
  const violations = useStudioStore((s) => s.violations);
  const pinCurrents = useStudioStore((s) => s.simulation?.solution?.pinCurrents);
  const [dragging, setDragging] = useState<{ id: string; dx: number; dz: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const end = () => setDragging(null);
    window.addEventListener("pointerup", end);
    return () => window.removeEventListener("pointerup", end);
  }, [dragging]);

  const worst = (id: string) => {
    const issues = violations.filter((v) => v.componentId === id);
    if (issues.some((v) => v.severity === "fail")) return highlights.fail;
    if (issues.some((v) => v.severity === "warn")) return highlights.warn;
    return null;
  };

  const startDrag = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || e.nativeEvent.defaultPrevented) return;
    e.stopPropagation();
    select({ kind: "component", id });
    const at = board[id];
    if (at) setDragging({ id, dx: at.x - e.point.x, dz: at.z - e.point.z });
  };

  const onPlaneMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    const hx = (BOARD.width / 2) * MM - EDGE_MARGIN;
    const hz = (BOARD.depth / 2) * MM - EDGE_MARGIN;
    placeOnBoard(dragging.id, snap(e.point.x + dragging.dx, -hx, hx), snap(e.point.z + dragging.dz, -hz, hz));
  };

  return (
    <Canvas
      shadows="percentage"
      camera={{ position: [0.06, 0.08, 0.115], fov: 35, near: 0.0005, far: 5 }}
      gl={{ alpha: true }}
      dpr={[1, 2]}
      className={dragging ? "cursor-grabbing" : undefined}
    >
      <StudioLighting />
      <DevHandle />

      <group scale={MM}>
        <Board {...BOARD} />
      </group>

      {components.map((c) => {
        const spec = partsById.get(c.specId);
        const at = board[c.id];
        if (!spec || !at) return null;
        const footprint = footprints[spec.footprintId];
        const selected = selection?.kind === "component" && selection.id === c.id;
        const resistance = spec.kind === "resistor" ? paramValue(c, spec, "resistance") : undefined;
        const outputVoltage = spec.kind === "regulator" ? paramValue(c, spec, "outputVoltage") : undefined;
        const current = spec.kind === "led" ? (pinCurrents?.[c.id]?.[0] ?? 0) : 0;
        return (
          <group
            key={c.id}
            position={[at.x, TOP, at.z]}
            rotation={[0, (-at.rotation * Math.PI) / 180, 0]}
            scale={MM}
            onPointerDown={startDrag(c.id)}
            onPointerOver={() => (document.body.style.cursor = "grab")}
            onPointerOut={() => (document.body.style.cursor = "")}
            onClick={(e) => e.stopPropagation()}
          >
            {footprint && (
              <Footprint
                footprint={footprint}
                designator={c.id}
                fontFamily={fontFamily}
                outline={selected ? highlights.selected : worst(c.id)}
              />
            )}
            <PartMesh
              footprintId={spec.footprintId}
              bands={resistance === undefined ? undefined : resistorBands(resistance)}
              marking={outputVoltage === undefined ? undefined : outputVoltage.toFixed(1).replace(".", "V")}
              glow={current / LED_NOMINAL_CURRENT}
            />
          </group>
        );
      })}

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, TOP, 0]}
        onPointerMove={onPlaneMove}
        onClick={(e) => {
          if (e.delta < 4) select(null);
        }}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <Grid
        args={[1, 1]}
        position={[0, -0.0001, 0]}
        cellSize={0.005}
        sectionSize={0.025}
        cellColor={colours.cell}
        sectionColor={colours.section}
        cellThickness={0.6}
        sectionThickness={1}
        fadeDistance={0.5}
        fadeStrength={1.5}
        infiniteGrid
      />
      <CameraRig enabled={!dragging} centre={[0, TOP, 0]} radius={FRAME_RADIUS} />
    </Canvas>
  );
};
