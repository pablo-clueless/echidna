"use client";

import type { ComponentSpec, NetlistComponent } from "@echidna/core";
import { type KeyboardEvent, useEffect, useId } from "react";
import { useTranslations } from "next-intl";

import { switchClosed, switchPositions } from "@/lib/project/model";
import { useProjectStore } from "@/stores/project";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { partKey } from "@/lib/messageKeys";
import { cn } from "@/lib/utils";

type Props = { component: NetlistComponent; spec: ComponentSpec };

const pressKeys = new Set([" ", "Enter"]);

/**
 * Operates a switch the way the real part is operated. A latching switch, such as a slide switch, flips with a
 * toggle and stays put; a momentary one, such as a push button, is closed only while its button is held down with
 * the pointer, Space or Enter.
 */
export const SwitchControl = ({ component, spec }: Props) => {
  const t = useTranslations("Studio.inspector.switch");
  const tParts = useTranslations("Parts");
  const setVariant = useProjectStore((s) => s.setVariant);
  const headingId = useId();
  const stateId = useId();
  const positions = switchPositions(spec);
  const momentary = spec.actuation === "momentary";

  /** Reads the store rather than the render, so a quick press and release never acts on a stale position. */
  const set = (closed: boolean) => {
    if (!positions) return;
    const current = useProjectStore.getState().components.find((c) => c.id === component.id);
    if (!current || switchClosed(spec, current.variant) === closed) return;
    setVariant(component.id, closed ? positions.closed : positions.open);
  };

  // A push button let go of by deselecting it mid-press, or by the panel closing, springs back like the real one.
  useEffect(
    () => () => {
      if (momentary) set(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [component.id, momentary],
  );

  if (!positions) return null;

  const key = partKey(spec.id);
  const closed = switchClosed(spec, component.variant);
  const state = tParts(`${key}.variants.${closed ? positions.closed : positions.open}` as never);
  const onKey = (e: KeyboardEvent, down: boolean) => {
    if (!pressKeys.has(e.key) || e.repeat) return;
    e.preventDefault();
    set(down);
  };

  return (
    <section aria-labelledby={headingId} className="grid gap-1.5">
      <h3 id={headingId} className="text-xs font-medium">
        {tParts(`${key}.variantLabel` as never)}
      </h3>
      <div className="flex items-center gap-2.5">
        {momentary ? (
          <Button
            type="button"
            variant="outline"
            aria-describedby={stateId}
            className={cn("touch-none select-none", closed && "bg-muted")}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              set(true);
            }}
            onPointerUp={() => set(false)}
            onPointerCancel={() => set(false)}
            onLostPointerCapture={() => set(false)}
            onKeyDown={(e) => onKey(e, true)}
            onKeyUp={(e) => onKey(e, false)}
            onBlur={() => set(false)}
          >
            {t("hold")}
          </Button>
        ) : (
          <Switch
            checked={closed}
            onCheckedChange={set}
            aria-labelledby={headingId}
            aria-describedby={stateId}
          />
        )}
        <span id={stateId} aria-live="polite" className="text-xs text-muted-foreground">
          {state}
        </span>
      </div>
    </section>
  );
};
