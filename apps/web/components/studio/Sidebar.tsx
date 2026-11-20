"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "cn";

import { LibrarySidebar } from "./LibrarySidebar";
import { AiAssistant } from "./AiAssistant";

export const Sidebar = () => {
  const t = useTranslations("Studio.sidebar");
  const MODES = [
    { label: t("library"), value: "library" },
    { label: t("ai-sssistant"), value: "ai-assistant" },
  ];
  const [currentMode, setCurrentMode] = useState("library");

  return (
    <aside aria-label={t("title")} className="text-sidebar-foreground flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 divide-x border-b px-3">
        {MODES.map((mode) => (
          <button
            className={cn(
              "h-full flex-1 text-sm font-medium",
              currentMode === mode.value ? "text-primary" : "",
            )}
            key={mode.value}
            onClick={() => setCurrentMode(mode.value)}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <LibrarySidebar tab={currentMode} />
      <AiAssistant tab={currentMode} />
    </aside>
  );
};
