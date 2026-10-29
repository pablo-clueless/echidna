"use client";

import { CircuitBoard, PanelLeft, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LocaleSelect } from "@/components/app/LocaleSelect";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { usePreferencesStore } from "@/stores/preferences";
import { IconButton } from "@/components/app/IconButton";
import { Separator } from "@/components/ui/separator";
import { useStudioStore } from "@/stores/studio";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

type Props = {
  libraryOpen?: boolean;
  onToggleLibrary?: () => void;
};

export const TopBar = ({ libraryOpen, onToggleLibrary }: Props) => {
  const t = useTranslations("Studio");
  const learnMode = usePreferencesStore((s) => s.learnMode);
  const setLearnMode = usePreferencesStore((s) => s.setLearnMode);
  const learnId = useId();
  const simulating = useStudioStore((s) => s.simulating);
  const setSimulating = useStudioStore((s) => s.setSimulating);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background px-3">
      {onToggleLibrary && (
        <IconButton label={t("toggleLibrary")} onClick={onToggleLibrary} aria-pressed={libraryOpen ?? false}>
          <PanelLeft />
        </IconButton>
      )}
      <Link href="/" className="text-sm font-semibold tracking-tight text-primary-text no-underline">
        Echidna
      </Link>
      <Separator orientation="vertical" className="h-5! max-sm:hidden" />
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium max-sm:hidden">{t("untitledProject")}</span>
        <Badge variant="outline" className="gap-1 text-muted-foreground max-md:hidden">
          <CircuitBoard />
          {t("blankBoard")}
        </Badge>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2 max-md:hidden">
          <Switch id={learnId} size="sm" checked={learnMode} onCheckedChange={setLearnMode} />
          <Label htmlFor={learnId} className="text-sm font-normal">
            {t("learnMode")}
          </Label>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={simulating ? "default" : "outline"}
              aria-pressed={simulating}
              onClick={() => setSimulating(!simulating)}
              className="max-md:hidden"
            >
              <Play data-icon="inline-start" />
              {t("simulate")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{simulating ? t("simulateOn") : t("simulateOff")}</TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="h-5! max-md:hidden" />
        <div className="flex items-center gap-1">
          <LocaleSelect />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};
