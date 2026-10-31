"use client";

import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Environment, Grid, Lightformer } from "@react-three/drei";
import { partTemperature } from "@echidna/rules";
import { partsById } from "@echidna/library";
import type { Group } from "three";

import { pinCurrentLookup, trackCurrents } from "@/lib/board/currents";
import { footprints, resistorBands } from "@/lib/board/footprints";
import { LED_NOMINAL_CURRENT } from "@/lib/simulation/ledState";
import { paramValue, switchClosed } from "@/lib/project/model";
import { BOARD, clampToBoard } from "@/lib/board/placement";
import { pinCurrentsAt } from "@/lib/simulation/switchOn";
import { useResolvedTheme } from "@/lib/useResolvedTheme";
import { applyMaskColour } from "./viewport/materials";
import { CurrentFlow } from "./viewport/CurrentFlow";
import { projectCopper } from "@/lib/board/copper";
import { useProjectStore } from "@/stores/project";
import { useLayoutStore } from "@/stores/layout";
import { useStudioStore } from "@/stores/studio";
import { Footprint } from "./viewport/Footprint";
import { CameraRig } from "./viewport/CameraRig";
import { PartMesh } from "./viewport/PartMesh";
import { HeatGlow } from "./viewport/HeatGlow";
import { Traces } from "./viewport/Traces";
import { Board } from "./viewport/Board";

/** Placements in the store are in metres; the board and parts are modelled in millimetres. */
const MM = 0.001;
const TOP = BOARD.thickness * MM;
/** Framing radius as a fraction of the board's half-diagonal: slightly inside it, so "fit" fills a wide view without cropping the corners. */
const FRAME_RADIUS = 0.85;
/** Just outside the half-diagonal, so a tall view such as a phone shows the whole board. */
const NARROW_FRAME_RADIUS = 1.05;
const SNAP = 0.0005;
/** Transistors print their part number, taken from the end of the spec ID, on the body. */
const TRANSISTOR_KINDS = new Set(["npn", "pnp", "nmos", "pmos"]);

const gridColours = {
  light: { cell: "#E9DFCF", section: "#D2C4AE" },
  dark: { cell: "#1C1B1F", section: "#2C2A30" },
} as const;

/** Outline colours: selection uses the brand orange; issues use status colours, never orange. */
const highlights = { selected: "#DE640E", fail: "#D92D20", warn: "#EAB308" } as const;

const snap = (v: number) => Math.round(v / SNAP) * SNAP;

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

/** Exposes the scene to `window.__echidna.three` in development, for inspecting the camera and renderer. */
const DevHandle = () => {
  const get = useThree((s) => s.get);
  useEffect(() => {
    if (process.env.NODE_ENV === "development") window.__echidna = { ...window.__echidna, three: get };
  }, [get]);
  return null;
};

/** Studio lighting baked into an environment map: a large soft key overhead and strip lights for edge highlights. */
const StudioLighting = ({ reach }: { reach: number }) => (
  <>
    <Environment resolution={256} frames={1} environmentIntensity={0.9}>
      <color attach="background" args={["#303136"]} />
      <Lightformer form="rect" intensity={3} position={[0, 2, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[3, 3, 1]} />
      <Lightformer form="rect" intensity={1.4} position={[0, 1.1, -2]} scale={[5, 1.6, 1]} />
      <Lightformer form="rect" intensity={0.7} position={[0, 1.1, 2]} rotation={[0, Math.PI, 0]} scale={[5, 1.2, 1]} />
      <Lightformer form="rect" intensity={1.6} position={[-2, 0.6, 0.5]} rotation={[0, Math.PI / 2, 0]} scale={[4, 0.5, 1]} />
      <Lightformer form="rect" intensity={1.2} position={[2, 0.8, -0.5]} rotation={[0, -Math.PI / 2, 0]} scale={[4, 0.4, 1]} />
      {/* Soft fill from below, so the solder side reads in the underside view. */}
      <Lightformer form="rect" intensity={0.9} position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[3, 3, 1]} />
    </Environment>
    <ambientLight intensity={0.15} />
    <directionalLight position={[-0.05, -0.12, -0.04]} intensity={0.5} />
    <directionalLight
      position={[0.12, 0.3, 0.16]}
      intensity={1.6}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0002}
      shadow-normalBias={0.00004}
      shadow-camera-left={-reach}
      shadow-camera-right={reach}
      shadow-camera-top={reach}
      shadow-camera-bottom={-reach}
      shadow-camera-near={0.1}
      shadow-camera-far={0.6}
    />
  </>
);

/** Hides its children while the camera is below the board, so the floor grid never covers the underside. */
const AboveBoardOnly = ({ children }: { children: ReactNode }) => {
  const ref = useRef<Group>(null);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.visible = camera.position.y > 0;
  });
  return <group ref={ref}>{children}</group>;
};

export const ViewportCanvas = () => {
  const colours = gridColours[useResolvedTheme()];
  const fontFamily = useMonoFont();
  const components = useProjectStore((s) => s.components);
  const board = useProjectStore((s) => s.board);
  const boardSize = useProjectStore((s) => s.boardSize);
  const wires = useProjectStore((s) => s.wires);
  const projectName = useProjectStore((s) => s.name);
  const maskColour = useLayoutStore((s) => s.maskColour);
  const overlays = useLayoutStore((s) => s.overlays);
  const ambient = useProjectStore((s) => s.ambientTemperature);
  const placeOnBoard = useProjectStore((s) => s.placeOnBoard);
  const selection = useStudioStore((s) => s.selection);
  const select = useStudioStore((s) => s.select);
  const violations = useStudioStore((s) => s.violations);
  const settledCurrents = useStudioStore((s) => s.simulation?.solution?.pinCurrents);
  const settledPower = useStudioStore((s) => s.simulation?.solution?.componentPower);
  const switchOn = useStudioStore((s) => s.switchOn?.outcome);
  const playhead = useStudioStore((s) => s.playhead);
  const pinCurrents = useMemo(
    () => (playhead !== null && switchOn?.ok && switchOn.solution ? pinCurrentsAt(switchOn.solution, playhead) : settledCurrents),
    [playhead, switchOn, settledCurrents],
  );
  const [dragging, setDragging] = useState<{ id: string; dx: number; dz: number } | null>(null);
  const copper = useMemo(() => projectCopper({ components, wires, board }), [components, wires, board]);
  const showCurrent = overlays.includes("current");
  const showHeat = overlays.includes("heat") && settledPower !== undefined;
  // Follows the switch-on playhead like the LEDs do, so scrubbing shows current building up in the copper.
  const trackFlow = useMemo(
    () =>
      showCurrent && pinCurrents
        ? trackCurrents(copper.routing, pinCurrentLookup(components, partsById, pinCurrents))
        : null,
    [showCurrent, pinCurrents, copper.routing, components],
  );
  const legend = [projectName.trim().toUpperCase(), "REV A"].filter(Boolean).join("  ·  ");

  useEffect(() => applyMaskColour(maskColour), [maskColour]);

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
    const { x, z } = clampToBoard(snap(e.point.x + dragging.dx), snap(e.point.z + dragging.dz), boardSize);
    placeOnBoard(dragging.id, x, z);
  };

  /** Half the board's diagonal, in metres: what the camera frames and the key light's shadows cover. */
  const halfDiagonal = (Math.hypot(boardSize.width, boardSize.depth) / 2) * MM;

  return (
    <Canvas
      shadows="percentage"
      camera={{ position: [0.06, 0.08, 0.115], fov: 35, near: 0.0005, far: 5 }}
      gl={{ alpha: true }}
      dpr={[1, 2]}
      className={dragging ? "cursor-grabbing" : undefined}
    >
      <StudioLighting reach={halfDiagonal * 1.15} />
      <DevHandle />

      <group scale={MM}>
        <Board {...boardSize} thickness={BOARD.thickness} drills={copper.drills} legend={legend} fontFamily={fontFamily} />
        <Traces routing={copper.routing} thickness={BOARD.thickness} />
        {trackFlow && <CurrentFlow routing={copper.routing} thickness={BOARD.thickness} currents={trackFlow} />}
      </group>

      {components.map((c) => {
        const spec = partsById.get(c.specId);
        const at = board[c.id];
        if (!spec || !at) return null;
        const footprint = footprints[spec.footprintId];
        const selected = selection?.kind === "component" && selection.id === c.id;
        const resistance = spec.kind === "resistor" ? paramValue(c, spec, "resistance") : undefined;
        const outputVoltage = spec.kind === "regulator" ? paramValue(c, spec, "outputVoltage") : undefined;
        const partNumber = TRANSISTOR_KINDS.has(spec.kind) ? spec.id.split("-").at(-1)?.toUpperCase() : undefined;
        const current = spec.kind === "led" ? (pinCurrents?.[c.id]?.[0] ?? 0) : 0;
        // Heat is the settled estimate: parts take seconds to warm, far longer than a switch-on run.
        const thermalResistance = spec.params.thermalResistance?.value;
        const temperature =
          showHeat && thermalResistance
            ? partTemperature(settledPower?.[c.id] ?? 0, { resistance: thermalResistance, ambient })
            : undefined;
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
                thickness={BOARD.thickness}
                outline={selected ? highlights.selected : worst(c.id)}
              />
            )}
            {footprint && temperature !== undefined && (
              <HeatGlow courtyard={footprint.courtyard} temperature={temperature} ambient={ambient} />
            )}
            <PartMesh
              footprintId={spec.footprintId}
              bands={resistance === undefined ? undefined : resistorBands(resistance)}
              marking={outputVoltage === undefined ? partNumber : outputVoltage.toFixed(1).replace(".", "V")}
              glow={current / LED_NOMINAL_CURRENT}
              ledColour={c.variant}
              closed={spec.kind === "switch" ? switchClosed(spec, c.variant) : undefined}
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

      <AboveBoardOnly>
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
      </AboveBoardOnly>
      <CameraRig
        enabled={!dragging}
        centre={[0, TOP, 0]}
        radius={halfDiagonal * FRAME_RADIUS}
        narrowRadius={halfDiagonal * NARROW_FRAME_RADIUS}
      />
    </Canvas>
  );
};
