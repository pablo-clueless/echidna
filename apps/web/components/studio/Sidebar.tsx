"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "cn";

import { LibrarySidebar } from "./LibrarySidebar";
import { AiAssistant } from "./AiAssistant";

const MODES = ["library", "ai-assistant"] as const;

type Mode = (typeof MODES)[number];

/** The studio's left sidebar: the parts library and the AI assistant, one at a time behind tabs. */
export const Sidebar = () => {
  const t = useTranslations("Studio.sidebar");
  const [mode, setMode] = useState<Mode>("library");
  const label = (m: Mode) => (m === "library" ? t("library") : t("assistant"));

  return (
    <div className="bg-sidebar text-sidebar-foreground flex h-full flex-col">
      <div
        aria-label={t("title")}
        className="flex h-10 shrink-0 items-stretch divide-x border-b"
        role="tablist"
      >
        {MODES.map((m) => (
          <button
            aria-controls={`tabpanel-${m}`}
            aria-selected={mode === m}
            className={cn(
              "focus-visible:ring-ring flex-1 px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset",
              mode === m ? "text-primary" : "text-muted-foreground hover:text-sidebar-foreground",
            )}
            id={`tab-${m}`}
            key={m}
            onClick={() => setMode(m)}
            role="tab"
            tabIndex={mode === m ? 0 : -1}
            type="button"
          >
            {label(m)}
          </button>
        ))}
      </div>
      <LibrarySidebar tab={mode} />
      <AiAssistant tab={mode} />
    </div>
  );
};
