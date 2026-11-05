"use client";

import type { ComponentSpec, NetlistComponent, Severity } from "@echidna/core";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { FitCheck } from "@echidna/rules";
import { partsById } from "@echidna/library";
import { useMemo } from "react";

import { slotOptions, type SlotOption } from "@/lib/project/slots";
import { protocolKey, slotKey } from "@/lib/messageKeys";
import { useProjectStore } from "@/stores/project";
import { Button } from "@/components/ui/button";
import { formatQuantity } from "@/lib/units";
import { cn } from "@/lib/utils";

export const dotClass: Record<Severity, string> = {
  pass: "bg-status-pass",
  warn: "bg-status-warn ring-1 ring-status-warn-border",
  fail: "bg-status-fail",
};

export const textClass: Record<Severity, string> = {
  pass: "text-status-pass-text",
  warn: "text-status-warn-text",
  fail: "text-status-fail-text",
};

/** The name of a host's rail, as its pin is labelled, such as `3V3`. */
export const railName = (host: ComponentSpec | undefined, railId: string) => {
  const pinId = host?.host?.rails.find((r) => r.id === railId)?.pinId;
  return host?.pins.find((p) => p.id === pinId)?.name ?? railId;
};

/** Words for one slot check that is not a pass: what the part needs and what the slot gives. */
export const useCheckReason = () => {
  const t = useTranslations("Studio.slots");
  const format = useFormatter();
  const locale = useLocale();
  const q = (value: number | undefined, unit = "") => formatQuantity(value ?? 0, unit, locale);
  const protocols = (ids: readonly string[] = []) =>
    format.list(
      ids.map((p) => t(`protocols.${protocolKey(p)}`)),
      { type: "disjunction" },
    );

  return (check: FitCheck, host: ComponentSpec | undefined): string => {
    const unit = check.unit ?? "";
    const reason = (() => {
      switch (check.id) {
        case "interface":
          return t("checks.interface", { protocols: protocols(check.protocols), accepts: protocols(check.accepts) });
        case "supply":
          return t("checks.supply", {
            min: q(check.min, "V"),
            max: q(check.limit, "V"),
            offered: format.list((check.offered ?? []).map((v) => q(v, "V")), { type: "conjunction" }),
          });
        case "railCurrent":
          return t("checks.railCurrent", {
            actual: q(check.actual, unit),
            limit: q(check.limit, unit),
            rail: railName(host, check.railId ?? ""),
          });
        default:
          return t(`checks.${check.id}`, { actual: q(check.actual, unit), limit: q(check.limit, unit) });
      }
    })();
    return check.estimated ? `${reason} ${t("estimated")}` : reason;
  };
};

const worstOf = (option: SlotOption): Severity =>
  option.fit.checks.some((c) => c.severity === "fail")
    ? "fail"
    : option.fit.checks.some((c) => c.severity === "warn")
      ? "warn"
      : "pass";

/**
 * Where the selected part can plug in: every slot on every host board in the project, each checked before it is
 * offered. A slot the part fails is shown with the reasons and cannot be chosen.
 */
export const SlotPicker = ({ component }: { component: NetlistComponent }) => {
  const t = useTranslations("Studio.slots");
  const components = useProjectStore((s) => s.components);
  const slots = useProjectStore((s) => s.slots);
  const plugIn = useProjectStore((s) => s.plugIn);
  const unplug = useProjectStore((s) => s.unplug);
  const reasonFor = useCheckReason();
  const options = useMemo(
    () => slotOptions({ components, slots }, partsById, component.id),
    [components, slots, component.id],
  );
  const current = slots[component.id];
  const specOf = (id: string) => partsById.get(components.find((c) => c.id === id)?.specId ?? "");

  return (
    <section aria-labelledby="slots-heading" className="grid gap-2">
      <h3 id="slots-heading" className="text-xs font-medium text-muted-foreground">
        {t("title")}
      </h3>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("noHost")}</p>
      ) : (
        <ul className="grid gap-1.5">
          {options.map((option) => {
            const host = specOf(option.hostId);
            const label = t("slotLabel", {
              host: option.hostId,
              slot: t(`names.${slotKey(option.slot.id)}`),
            });
            const here = current?.hostId === option.hostId && current.slotId === option.slot.id;
            const severity = worstOf(option);
            const problems = option.fit.checks.filter((c) => c.severity !== "pass");
            const rail = railName(host, option.fit.railId ?? "");
            const status = here
              ? t("pluggedIn", { rail })
              : option.occupant
                ? t("inUse", { id: option.occupant })
                : option.fit.fits
                  ? t("fits", { rail })
                  : t("blocked");
            return (
              <li
                key={`${option.hostId}:${option.slot.id}`}
                aria-label={label}
                className="grid gap-1 rounded-md border px-2.5 py-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{label}</span>
                  {here ? (
                    <Button size="xs" variant="outline" onClick={() => unplug(component.id)}>
                      {t("unplug")}
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={!option.fit.fits || option.occupant !== undefined}
                      onClick={() => plugIn(component.id, option.hostId, option.slot.id)}
                    >
                      {t("plugIn")}
                    </Button>
                  )}
                </div>
                <p className="flex items-center gap-1.5">
                  <span aria-hidden className={cn("size-1.5 shrink-0", option.occupant && !here ? "bg-muted-foreground/40" : dotClass[severity])} />
                  <span className={cn("font-medium", option.occupant && !here ? "text-muted-foreground" : textClass[severity])}>
                    {status}
                  </span>
                </p>
                {problems.length > 0 && (
                  <ul className="grid gap-0.5 pl-3 text-muted-foreground">
                    {problems.map((c) => (
                      <li key={c.id} className={cn(c.severity === "fail" && "text-foreground")}>
                        {reasonFor(c, host)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
