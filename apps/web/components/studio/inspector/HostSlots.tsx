"use client";

import type { ComponentSpec, NetlistComponent } from "@echidna/core";
import { useLocale, useTranslations } from "next-intl";
import { partsById } from "@echidna/library";
import { checkBuild } from "@echidna/rules";
import { useMemo } from "react";

import { dotClass, railName, textClass, useCheckReason } from "./SlotPicker";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { useProjectStore } from "@/stores/project";
import { useStudioStore } from "@/stores/studio";
import { modulesIn } from "@/lib/project/slots";
import { formatQuantity } from "@/lib/units";
import { slotKey } from "@/lib/messageKeys";
import { cn } from "@/lib/utils";

/** A host board's rails, with the current drawn from each, and what is plugged into each of its slots. */
export const HostSlots = ({ component, spec }: { component: NetlistComponent; spec: ComponentSpec }) => {
  const t = useTranslations("Studio.slots");
  const locale = useLocale();
  const slots = useProjectStore((s) => s.slots);
  const components = useProjectStore((s) => s.components);
  const pinCurrents = useStudioStore((s) => s.simulation?.solution?.pinCurrents);
  const reasonFor = useCheckReason();
  const buildChecks = useMemo(
    () => (spec.module ? checkBuild(spec, modulesIn({ components, slots }, partsById, component.id)) : []),
    [spec, components, slots, component.id],
  );
  if (!spec.host) return null;

  return (
    <>
      {spec.module && (
        <section aria-labelledby="build-heading" className="grid gap-1">
          <h3 id="build-heading" className="text-xs font-medium text-muted-foreground">
            {t("buildTitle")}
          </h3>
          {buildChecks.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("buildEmpty")}</p>
          ) : (
            <ul className="grid gap-1">
              {buildChecks.map((check) => (
                <li key={`${check.id}:${check.connector ?? ""}`} className="flex items-start gap-1.5 text-xs">
                  <span aria-hidden className={cn("mt-1 size-1.5 shrink-0", dotClass[check.severity])} />
                  <span className={cn(check.severity !== "pass" && textClass[check.severity])}>{reasonFor(check, spec)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {spec.host.rails.length > 0 && (
      <section aria-labelledby="rails-heading" className="grid gap-1">
        <h3 id="rails-heading" className="text-xs font-medium text-muted-foreground">
          {t("railsTitle")}
        </h3>
        <dl>
          {spec.host.rails.map((rail) => {
            const solved = Math.abs(pinCurrents?.[`${component.id}:${rail.id}`]?.[0] ?? 0);
            // Below this is solver leakage into an unused rail, not current anything draws.
            const drawn = solved < 1e-8 ? 0 : solved;
            return (
              <div key={rail.id} className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
                <dt className="font-mono">{railName(spec, rail.id)}</dt>
                <dd className="flex items-center gap-1.5 font-mono tabular-nums">
                  {t("railLoad", {
                    actual: formatQuantity(drawn, "A", locale),
                    limit: formatQuantity(rail.maxCurrent.value, "A", locale),
                  })}
                  <ProvenanceBadge source={rail.maxCurrent.source} />
                </dd>
              </div>
            );
          })}
        </dl>
      </section>
      )}
      <section aria-labelledby="host-slots-heading" className="grid gap-1">
        <h3 id="host-slots-heading" className="text-xs font-medium text-muted-foreground">
          {t("hostTitle")}
        </h3>
        <dl>
          {spec.host.slots.map((slot) => {
            const occupant = Object.entries(slots).find(([, at]) => at.hostId === component.id && at.slotId === slot.id)?.[0];
            return (
              <div key={slot.id} className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
                <dt>{t(`names.${slotKey(slot.id)}`)}</dt>
                <dd className="font-mono">{occupant ?? t("empty")}</dd>
              </div>
            );
          })}
        </dl>
      </section>
    </>
  );
};
