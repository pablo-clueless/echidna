"use client";

import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";

const ViewportCanvas = dynamic(() => import("./ViewportCanvas").then((m) => m.ViewportCanvas), { ssr: false });

export const Viewport = () => {
  const t = useTranslations("Studio.viewport");

  return (
    <section aria-label={t("label")} className="relative h-full bg-(--colour-viewport)">
      <ViewportCanvas />
    </section>
  );
};
