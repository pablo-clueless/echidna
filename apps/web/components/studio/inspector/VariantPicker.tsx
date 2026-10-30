"use client";

import type { ComponentSpec, NetlistComponent } from "@echidna/core";
import { useTranslations } from "next-intl";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ledColours } from "@/lib/parts/ledColours";
import { useProjectStore } from "@/stores/project";
import { partKey } from "@/lib/messageKeys";

/** Chooses between a part's variants, such as an LED's colour. Shown only for parts that have variants. */
export const VariantPicker = ({ component, spec }: { component: NetlistComponent; spec: ComponentSpec }) => {
  const tParts = useTranslations("Parts");
  const setVariant = useProjectStore((s) => s.setVariant);
  const variants = spec.variants ?? [];
  if (variants.length < 2) return null;

  const key = partKey(spec.id);
  const label = tParts(`${key}.variantLabel` as never);
  const value = component.variant ?? variants[0]?.id ?? "";

  return (
    <section aria-labelledby="variant-heading" className="grid gap-1.5">
      <h3 id="variant-heading" className="text-xs font-medium">
        {label}
      </h3>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        spacing={1}
        aria-labelledby="variant-heading"
        value={value}
        onValueChange={(next) => {
          if (next) setVariant(component.id, next);
        }}
        className="flex-wrap"
      >
        {variants.map((v) => {
          const swatch = spec.kind === "led" ? ledColours[v.id]?.light : undefined;
          return (
            <ToggleGroupItem key={v.id} value={v.id} className="h-8 gap-1.5 px-2.5 text-xs">
              {swatch && (
                <span aria-hidden className="size-3 rounded-full ring-1 ring-foreground/25" style={{ backgroundColor: swatch }} />
              )}
              {tParts(`${key}.variants.${v.id}` as never)}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </section>
  );
};
