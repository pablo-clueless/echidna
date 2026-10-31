"use client";

import { useTranslations } from "next-intl";

import { fromCelsius, toCelsius } from "@/lib/units";
import { AMBIENT_LIMITS } from "@/lib/project/model";
import { useProjectStore } from "@/stores/project";
import { NumberField } from "./NumberField";

/** Edits the air temperature around the board, which every part temperature estimate starts from. */
export const AmbientField = () => {
  const t = useTranslations("Studio.inspector.environment");
  const ambient = useProjectStore((s) => s.ambientTemperature);
  const setAmbientTemperature = useProjectStore((s) => s.setAmbientTemperature);
  const [min, max] = [Math.round(toCelsius(AMBIENT_LIMITS.min)), Math.round(toCelsius(AMBIENT_LIMITS.max))];

  return (
    <section aria-labelledby="environment-heading" className="grid gap-3 p-3 pt-0">
      <h3 id="environment-heading" className="text-xs font-medium text-muted-foreground">
        {t("title")}
      </h3>
      <NumberField
        label={t("ambient")}
        name="ambient-temperature"
        value={Math.round(toCelsius(ambient) * 100) / 100}
        unit="°C"
        min={min}
        max={max}
        outOfRange={t("outOfRange", { min, max })}
        onCommit={(celsius) => setAmbientTemperature(fromCelsius(celsius))}
      />
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </section>
  );
};
