"use client";

import { MousePointerClick, Package, Spline } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useState } from "react";

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { ValidatorDrawer } from "./validator/ValidatorDrawer";
import { InspectorPanel } from "./InspectorPanel";
import { LibrarySidebar } from "./LibrarySidebar";
import { SchematicPanel } from "./SchematicPanel";
import { Viewport } from "./Viewport";
import { TopBar } from "./TopBar";
import { cn } from "@/lib/utils";

type Sheet = "library" | "schematic" | "inspector";

const sheets: { key: Sheet; icon: ReactNode; panel: ReactNode }[] = [
  { key: "library", icon: <Package />, panel: <LibrarySidebar /> },
  { key: "schematic", icon: <Spline />, panel: <SchematicPanel /> },
  { key: "inspector", icon: <MousePointerClick />, panel: <InspectorPanel /> },
];

export const MobileStudio = () => {
  const t = useTranslations("Studio");
  const [sheet, setSheet] = useState<Sheet>("library");
  const [open, setOpen] = useState(false);
  const current = sheets.find((s) => s.key === sheet);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar />
      <div className="min-h-0 flex-1">
        <Viewport />
      </div>
      <ValidatorDrawer />

      <nav aria-label={t("panels")} className="grid shrink-0 grid-cols-3 border-t bg-background pb-[env(safe-area-inset-bottom)]">
        {sheets.map(({ key, icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={open && sheet === key}
            onClick={() => {
              setSheet(key);
              setOpen(true);
            }}
            className={cn(
              "flex h-14 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground transition-colors outline-none focus-visible:bg-muted [&_svg]:size-5",
              open && sheet === key && "text-foreground",
            )}
          >
            {icon}
            {t(`${key}.title`)}
          </button>
        ))}
      </nav>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent aria-describedby={undefined}>
          {current && (
            <>
              <DrawerTitle className="sr-only">{t(`${current.key}.title`)}</DrawerTitle>
              <div className="h-[60dvh] overflow-y-auto">{current.panel}</div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
};
