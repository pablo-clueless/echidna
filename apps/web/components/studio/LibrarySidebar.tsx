"use client";

import type { ComponentSpec, DeviceType } from "@echidna/core";
import { ChevronRight, Package, Search } from "lucide-react";
import { parts, partsById } from "@echidna/library";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { BOX_KINDS, freeSchematicSpot, GRID, PART_MIME } from "@/lib/schematic/symbols";
import { fitsFoundation, foundationsFor } from "@/lib/project/foundation";
import { boundsOf, SymbolGlyph } from "./schematic/SymbolGlyph";
import { useProjectStore } from "@/stores/project";
import { useLayoutStore } from "@/stores/layout";
import { useStudioStore } from "@/stores/studio";
import { partKey } from "@/lib/messageKeys";
import { PanelHeader } from "./PanelHeader";
import { PanelEmpty } from "./PanelEmpty";

const categories = [
  { key: "power", kinds: ["supply", "regulator", "ground"] },
  { key: "passives", kinds: ["resistor", "capacitor", "inductor", "switch"] },
  { key: "semiconductors", kinds: ["led", "diode", "npn", "pnp", "nmos", "pmos"] },
  { key: "devBoards", kinds: ["devBoard"] },
  { key: "sensors", kinds: ["sensor"] },
  { key: "motherboards", kinds: ["motherboard"] },
  { key: "pcParts", kinds: ["cpu", "gpu", "memory", "storage", "cooler", "psu"] },
  { key: "laptops", kinds: ["laptopBoard"] },
  { key: "laptopParts", kinds: ["battery", "wifi", "display", "charger"] },
  { key: "drones", kinds: ["droneFrame"] },
  {
    key: "droneParts",
    kinds: ["droneMotors", "droneProps", "droneBattery", "esc", "flightController", "droneCamera"],
  },
  { key: "phones", kinds: ["phoneBoard"] },
  {
    key: "phoneParts",
    kinds: ["soc", "modem", "pmic", "phoneBattery", "phoneDisplay", "phoneCamera", "chargingCoil"],
    device: "smartphone",
  },
  { key: "wearables", kinds: ["wearableBoard"] },
  {
    key: "wearableParts",
    kinds: ["soc", "pmic", "phoneBattery", "phoneDisplay", "wearableSensor", "haptics", "radio"],
    device: "wearable",
  },
] as const satisfies readonly { key: string; kinds: readonly string[]; device?: DeviceType }[];

/** How far a symbol reaches either side of its origin, leads included, turned as placed. */
const halfWidthOf = (spec: ComponentSpec, rotation: number) => {
  const b = boundsOf(spec);
  const lead = BOX_KINDS.has(spec.kind) ? 1 : 0;
  return rotation % 180 === 0 ? b.w + lead : b.h;
};

const PartIcon = ({ spec }: { spec: ComponentSpec }) => {
  const b = boundsOf(spec);
  // Box symbols' leads reach a unit past the body.
  const span = Math.max(b.w + (BOX_KINDS.has(spec.kind) ? 1 : 0), b.h) + 0.6;
  return (
    <svg
      aria-hidden
      viewBox={`${-span * GRID} ${-span * GRID} ${span * 2 * GRID} ${span * 2 * GRID}`}
      className="bg-background text-foreground size-8 shrink-0 rounded-md border p-1"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
    >
      <SymbolGlyph spec={spec} />
    </svg>
  );
};

export const LibrarySidebar = () => {
  const t = useTranslations("Studio.library");
  const tParts = useTranslations("Parts");
  const tFoundation = useTranslations("Studio.foundation");
  const foundation = useProjectStore((s) => s.foundation);
  const empty = useProjectStore((s) => s.components.length === 0);
  // Only parts that belong on the project's foundation can be added, so a laptop board never lands on a PCB.
  const fits = (spec: ComponentSpec) => empty || fitsFoundation(spec, foundation);
  const [query, setQuery] = useState("");
  const select = useStudioStore((s) => s.select);
  const collapsed = useLayoutStore((s) => s.collapsedCategories);
  const setCategoryOpen = useLayoutStore((s) => s.setCategoryOpen);

  const add = (specId: string) => {
    const { addComponent, components, schematic } = useProjectStore.getState();
    const spec = partsById.get(specId);
    const placed = components.flatMap((c) => {
      const at = schematic[c.id];
      const placedSpec = partsById.get(c.specId);
      return at && placedSpec ? [{ ...at, halfWidth: halfWidthOf(placedSpec, at.rotation) }] : [];
    });
    const id = addComponent(
      specId,
      freeSchematicSpot(placed, spec ? halfWidthOf(spec, 0) : undefined),
    );
    if (id) select({ kind: "component", id });
  };

  const needle = query.trim().toLocaleLowerCase();
  const groups = categories
    .map((c) => ({
      ...c,
      parts: parts.filter(
        (p) =>
          (c.kinds as readonly string[]).includes(p.kind) &&
          (!("device" in c) || p.deviceTypes.includes(c.device)) &&
          (!needle ||
            tParts(`${partKey(p.id)}.name`)
              .toLocaleLowerCase()
              .includes(needle)),
      ),
    }))
    .filter((c) => c.parts.length > 0);

  return (
    <aside
      aria-label={t("title")}
      className="bg-sidebar text-sidebar-foreground flex h-full flex-col"
    >
      <PanelHeader title={t("title")} />
      <div className="p-2">
        <InputGroup className="bg-background h-8">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder={t("search")}
            aria-label={t("search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </InputGroup>
      </div>
      {groups.length === 0 ? (
        <PanelEmpty
          icon={<Package />}
          title={t("noMatchTitle")}
          description={t("noMatchDescription")}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {groups.map((group) => (
            <Collapsible
              key={group.key}
              asChild
              // Searching shows every match, whatever the user has collapsed.
              open={needle ? true : !collapsed.includes(group.key)}
              onOpenChange={(open) => setCategoryOpen(group.key, open)}
            >
              <section aria-labelledby={`library-${group.key}`} className="mt-2 first:mt-0">
                <h3 id={`library-${group.key}`}>
                  <CollapsibleTrigger
                    disabled={!!needle}
                    className="group text-muted-foreground hover:text-sidebar-foreground focus-visible:ring-ring disabled:hover:text-muted-foreground flex w-full items-center gap-1 rounded-md px-1 py-1.5 text-xs font-medium outline-none focus-visible:ring-2"
                  >
                    <ChevronRight
                      aria-hidden
                      className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
                    />
                    <span className="flex-1 text-left">{t(`categories.${group.key}`)}</span>
                    <span className="tabular-nums">{group.parts.length}</span>
                  </CollapsibleTrigger>
                </h3>
                <CollapsibleContent asChild>
                  <ul className="flex flex-col gap-0.5">
                    {group.parts.map((p) => {
                      const fit = fits(p);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            draggable={fit}
                            aria-disabled={!fit}
                            onDragStart={(e) => {
                              e.dataTransfer.setData(PART_MIME, p.id);
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => {
                              if (fit) add(p.id);
                            }}
                            title={fit ? t("addHint") : undefined}
                            className="hover:bg-sidebar-accent focus-visible:ring-ring flex w-full cursor-grab items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-sm outline-none focus-visible:ring-2 active:cursor-grabbing aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-transparent"
                          >
                            <PartIcon spec={p} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">
                                {tParts(`${partKey(p.id)}.name`)}
                              </span>
                              <span
                                className={
                                  fit
                                    ? "text-muted-foreground block truncate text-xs"
                                    : "text-muted-foreground block text-xs"
                                }
                              >
                                {fit
                                  ? tParts(`${partKey(p.id)}.summary`)
                                  : tFoundation(`refused.${foundationsFor(p)[0] ?? "pcb"}`)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </CollapsibleContent>
              </section>
            </Collapsible>
          ))}
        </div>
      )}
    </aside>
  );
};
