"use client";

import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { partsById } from "@echidna/library";
import { useEffect, useState } from "react";

import { useResolvedTheme } from "@/lib/useResolvedTheme";
import { useProjectStore } from "@/stores/project";
import { useStudioStore } from "@/stores/studio";
import { PartMesh } from "./viewport/PartMesh";

/** Board size in metres: 100 × 70 mm, 1.6 mm FR-4. */
const BOARD = { width: 0.1, thickness: 0.0016, depth: 0.07 };
const EDGE_MARGIN = 0.004;
const SNAP = 0.0005;

const sceneColours = {
  light: { cell: "#E9DFCF", section: "#D2C4AE", board: "#55656D", part: "#26262B", lead: "#C8CCD0", accent: "#2F7D4A", led: "#E5484D" },
  dark: { cell: "#1C1B1F", section: "#2C2A30", board: "#3B4A52", part: "#1A1A1E", lead: "#A9AEB3", accent: "#2F7D4A", led: "#E5484D" },
} as const;

/** Highlight colours: selection uses the brand orange; issues use status colours, never orange. */
const highlights = { selected: "#DE640E", fail: "#D92D20", warn: "#EAB308" } as const;

const snap = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v / SNAP) * SNAP));

export const ViewportCanvas = () => {
  const colours = sceneColours[useResolvedTheme()];
  const components = useProjectStore((s) => s.components);
  const board = useProjectStore((s) => s.board);
  const placeOnBoard = useProjectStore((s) => s.placeOnBoard);
  const selection = useStudioStore((s) => s.selection);
  const select = useStudioStore((s) => s.select);
  const violations = useStudioStore((s) => s.violations);
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
    if (e.button !== 0) return;
    e.stopPropagation();
    select({ kind: "component", id });
    const at = board[id];
    if (at) setDragging({ id, dx: at.x - e.point.x, dz: at.z - e.point.z });
  };

  const onPlaneMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    const hx = BOARD.width / 2 - EDGE_MARGIN;
    const hz = BOARD.depth / 2 - EDGE_MARGIN;
    placeOnBoard(dragging.id, snap(e.point.x + dragging.dx, -hx, hx), snap(e.point.z + dragging.dz, -hz, hz));
  };

  return (
    <Canvas
      shadows
      camera={{ position: [0.09, 0.09, 0.11], fov: 40, near: 0.001, far: 10 }}
      gl={{ alpha: true }}
      dpr={[1, 2]}
      className={dragging ? "cursor-grabbing" : undefined}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[0.2, 0.4, 0.3]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
      <mesh position={[0, BOARD.thickness / 2, 0]} receiveShadow>
        <boxGeometry args={[BOARD.width, BOARD.thickness, BOARD.depth]} />
        <meshStandardMaterial color={colours.board} roughness={0.7} />
      </mesh>

      {components.map((c) => {
        const spec = partsById.get(c.specId);
        const at = board[c.id];
        if (!spec || !at) return null;
        const selected = selection?.kind === "component" && selection.id === c.id;
        return (
          <group
            key={c.id}
            position={[at.x, BOARD.thickness, at.z]}
            rotation={[0, (-at.rotation * Math.PI) / 180, 0]}
            onPointerOver={() => (document.body.style.cursor = "grab")}
            onPointerOut={() => (document.body.style.cursor = "")}
            onClick={(e) => e.stopPropagation()}
          >
            <PartMesh
              kind={spec.kind}
              palette={{ body: colours.part, lead: colours.lead, accent: colours.accent, led: colours.led }}
              highlight={selected ? highlights.selected : worst(c.id)}
              onPointerDown={startDrag(c.id)}
            />
          </group>
        );
      })}

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, BOARD.thickness, 0]}
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
      <OrbitControls makeDefault enabled={!dragging} minDistance={0.03} maxDistance={1} />
    </Canvas>
  );
};
