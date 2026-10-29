"use client";

import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";

import { usePreferencesStore } from "@/stores/preferences";
import { IconButton } from "./IconButton";

export const ThemeToggle = () => {
  const t = useTranslations("Preferences");
  const setTheme = usePreferencesStore((s) => s.setTheme);

  const toggle = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

  return (
    <IconButton label={t("toggleTheme")} onClick={toggle}>
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </IconButton>
  );
};
