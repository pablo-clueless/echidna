"use client";

import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

import { useResolvedTheme } from "@/lib/useResolvedTheme";

const BOARD_SIZE: [number, number, number] = [0.1, 0.0016, 0.07];

const sceneColours = {
  light: { cell: "#E9DFCF", section: "#D2C4AE", board: "#55656D" },
  dark: { cell: "#1C1B1F", section: "#2C2A30", board: "#3B4A52" },
} as const;

export const ViewportCanvas = () => {
  const colours = sceneColours[useResolvedTheme()];

  return (
    <Canvas camera={{ position: [0.12, 0.1, 0.12], fov: 40, near: 0.001, far: 10 }} gl={{ alpha: true }} dpr={[1, 2]}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[0.2, 0.4, 0.3]} intensity={1.1} />
      <mesh position={[0, BOARD_SIZE[1] / 2, 0]}>
        <boxGeometry args={BOARD_SIZE} />
        <meshStandardMaterial color={colours.board} roughness={0.7} />
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
      <OrbitControls makeDefault minDistance={0.03} maxDistance={1} />
    </Canvas>
  );
};
