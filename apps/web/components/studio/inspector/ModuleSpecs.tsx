"use client";

import type { ComponentSpec, ModuleSpec, SpecValue } from "@echidna/core";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import { ProvenanceBadge } from "./ProvenanceBadge";
import { pmicRailKey } from "@/lib/messageKeys";
import { formatQuantity } from "@/lib/units";

/** Seconds in an hour: joules in a watt-hour, and coulombs in an amp-hour. */
const HOUR = 3600;

type Row = { key: string; label: string; value: SpecValue };

/** The module fields that hold a spec value, in the order they are listed. */
const FIELDS = [
  "power",
  "typical",
  "heat",
  "cooling",
  "output",
  "energy",
  "capacity",
  "cRating",
  "mass",
  "thrust",
  "current",
  "efficiency",
  "maxCurrent",
  "diameter",
] as const satisfies readonly (keyof ModuleSpec)[];

/**
 * Every figure a desktop, laptop, drone, phone or wearable part is described by, each with where it came from: a
 * datasheet, a teardown or an estimate. Hovering a badge gives the source or the reasoning behind an estimate.
 */
export const ModuleSpecs = ({ spec }: { spec: ComponentSpec }) => {
  const t = useTranslations("Studio.moduleSpecs");
  const tRails = useTranslations("Studio.slots.pmicRails");
  const locale = useLocale();
  const format = useFormatter();
  const moduleSpec = spec.module;
  if (!moduleSpec) return null;

  const rows: Row[] = [
    ...FIELDS.flatMap((key) => {
      const value = moduleSpec[key];
      return value ? [{ key, label: t(key), value }] : [];
    }),
    ...(moduleSpec.rails ?? []).flatMap((rail) => [
      {
        key: `${rail.id}:voltage`,
        label: t("railVoltage", { rail: tRails(pmicRailKey(rail.id)) }),
        value: rail.voltage,
      },
      {
        key: `${rail.id}:current`,
        label: t("railCurrent", { rail: tRails(pmicRailKey(rail.id)) }),
        value: rail.maxCurrent,
      },
    ]),
  ];
  if (rows.length === 0) return null;

  const show = ({ value, unit }: SpecValue) => {
    switch (unit) {
      case "J":
        return formatQuantity(value / HOUR, "Wh", locale);
      case "C":
        return `${format.number((value / HOUR) * 1000, { maximumFractionDigits: 0 })} mAh`;
      case "kg":
        return formatQuantity(value * 1000, "g", locale);
      default:
        return formatQuantity(value, unit, locale);
    }
  };

  return (
    <section aria-labelledby="module-specs-heading" className="grid gap-1">
      <h3 id="module-specs-heading" className="text-muted-foreground text-xs font-medium">
        {t("title")}
      </h3>
      <dl>
        {rows.map((row) => (
          <div
            key={row.key}
            data-testid="module-spec"
            className="flex items-baseline justify-between gap-3 py-0.5 text-xs"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="flex items-center gap-1.5 font-mono tabular-nums">
              {show(row.value)}
              <ProvenanceBadge source={row.value.source} reference={row.value.reference} />
            </dd>
          </div>
        ))}
        {moduleSpec.rail && (
          <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
            <dt className="text-muted-foreground">{t("rail")}</dt>
            <dd>{tRails(pmicRailKey(moduleSpec.rail))}</dd>
          </div>
        )}
      </dl>
    </section>
  );
};
