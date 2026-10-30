"use client";

import { type KeyboardEvent, useId } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";

import { cameraShortcuts, CameraToolbar } from "./viewport/CameraToolbar";
import { useViewportStore } from "@/stores/viewport";

const ViewportCanvas = dynamic(() => import("./ViewportCanvas").then((m) => m.ViewportCanvas), { ssr: false });

const PAN_STEP = 0.08;
const panKeys: Record<string, [number, number]> = {
  ArrowLeft: [-PAN_STEP, 0],
  ArrowRight: [PAN_STEP, 0],
  ArrowUp: [0, PAN_STEP],
  ArrowDown: [0, -PAN_STEP],
};

export const Viewport = () => {
  const t = useTranslations("Studio.viewport");
  const helpId = useId();

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const camera = useViewportStore.getState().camera;
    if (!camera || e.altKey || e.ctrlKey || e.metaKey) return;
    // Leave keys alone on the toolbar buttons, where Enter, Space and arrows already mean something.
    if (e.target instanceof Element && e.target.closest("button")) return;
    const pan = panKeys[e.key];
    if (pan) {
      e.preventDefault();
      camera.pan(...pan);
      return;
    }
    const command = (Object.keys(cameraShortcuts) as (keyof typeof cameraShortcuts)[]).find((c) =>
      cameraShortcuts[c].includes(e.key),
    );
    if (command) {
      e.preventDefault();
      camera[command]();
    }
  };

  return (
    <section
      aria-label={t("label")}
      aria-describedby={helpId}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        if (e.target instanceof HTMLCanvasElement) e.currentTarget.focus({ preventScroll: true });
      }}
      className="relative h-full bg-(--colour-viewport) outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <p id={helpId} className="sr-only">
        {t("help")}
      </p>
      <ViewportCanvas />
      <CameraToolbar />
    </section>
  );
};
