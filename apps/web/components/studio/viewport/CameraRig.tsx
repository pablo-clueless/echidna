"use client";

import { type ComponentRef, useEffect, useRef } from "react";
import { CameraControls } from "@react-three/drei";
import { Sphere, Vector3 } from "three";

import { useViewportStore } from "@/stores/viewport";

type Props = {
  enabled: boolean;
  /** Centre of the board, in metres. */
  centre: [number, number, number];
  /** Radius that frames the whole board, in metres. */
  radius: number;
};

/** Three-quarter view from the front right, as azimuth and polar angles. */
const ANGLED = { azimuth: Math.atan2(0.06, 0.115), polar: Math.acos(0.08 / Math.hypot(0.06, 0.08, 0.115)) };
const ZOOM_STEP = 0.3;

/**
 * Orbit, pan and zoom for the 3D view, with animated moves published to the viewport store for the toolbar.
 * Left drag orbits, right drag pans, the wheel zooms towards the cursor, and two fingers pinch and pan.
 */
export const CameraRig = ({ enabled, centre, radius }: Props) => {
  const ref = useRef<ComponentRef<typeof CameraControls>>(null);
  const setCamera = useViewportStore((s) => s.setCamera);
  const [cx, cy, cz] = centre;

  useEffect(() => {
    const controls = ref.current;
    if (!controls) return;
    const board = new Sphere(new Vector3(cx, cy, cz), radius);
    const frame = (azimuth: number, polar: number, animate = true) => {
      void controls.rotateTo(azimuth, polar, animate);
      void controls.fitToSphere(board, animate);
    };

    frame(ANGLED.azimuth, ANGLED.polar, false);
    setCamera({
      zoomIn: () => void controls.dolly(controls.distance * ZOOM_STEP, true),
      zoomOut: () => void controls.dolly(-controls.distance * ZOOM_STEP, true),
      fit: () => void controls.fitToSphere(board, true),
      top: () => frame(0, 0),
      angled: () => frame(ANGLED.azimuth, ANGLED.polar),
      pan: (x, y) => void controls.truck(x * controls.distance, -y * controls.distance, true),
    });
    return () => setCamera(null);
  }, [cx, cy, cz, radius, setCamera]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      enabled={enabled}
      dollyToCursor
      minDistance={0.008}
      maxDistance={0.6}
      maxPolarAngle={Math.PI * 0.49}
      smoothTime={0.2}
    />
  );
};
