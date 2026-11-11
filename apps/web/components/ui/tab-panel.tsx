"use client";

import { AnimatePresence, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import React from "react";
import { cn } from "cn";

interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  tab: string;
  value: string;
  animated?: boolean;
  children?: React.ReactNode;
  className?: string;
  innerClassName?: string;
  preserveContent?: boolean;
}

const TabPanel = React.forwardRef<HTMLDivElement, TabPanelProps>(
  (
    { tab, value, children, className, innerClassName, animated = false, preserveContent = false },
    ref,
  ) => {
    if (typeof tab !== typeof value) {
      throw new Error("TabPanel: tab and value must be of the same type");
    }

    const isSelected = tab === value;
    const content = <div className={cn("h-full w-full", innerClassName)}>{children}</div>;

    return (
      <div
        ref={ref}
        role="tabpanel"
        hidden={!isSelected}
        id={`tabpanel-${value}`}
        aria-labelledby={`tab-${value}`}
        aria-hidden={!isSelected}
        tabIndex={isSelected ? 0 : -1}
        className={cn("h-full w-full", className)}
      >
        {animated ? (
          <AnimatePresence mode="wait">
            {(isSelected || preserveContent) && (
              <motion.div
                key={`${value}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full w-full"
              >
                {content}
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          isSelected && content
        )}
      </div>
    );
  },
);

TabPanel.displayName = "TabPanel";

type Tab = {
  label: string;
  value: string;
  disabled?: boolean;
  description?: string;
  icon?: LucideIcon;
};

interface TabListProps extends React.HTMLAttributes<HTMLDivElement> {
  onTabChange: (tab: string) => void;
  tab: string;
  tabs: Tab[];
  animated?: boolean;
  buttonClassName?: string;
  className?: string;
}

const TabList = React.forwardRef<HTMLDivElement, TabListProps>(
  ({ onTabChange, tab, tabs, buttonClassName, className }, ref) => {
    return (
      <div className={cn("flex items-center", className)} ref={ref}>
        {tabs.map((t) => (
          <button
            aria-label={t.label}
            className={cn(
              "flex-1 px-4 py-1.5 text-center text-xs font-medium",
              tab === t.value ? "text-primary" : "bg-muted text-muted-foreground",
              t.disabled && "text-muted",
              buttonClassName,
            )}
            key={t.value}
            onClick={() => onTabChange(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
    );
  },
);

export { TabPanel, TabList };
