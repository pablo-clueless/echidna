"use client";

import { Package, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { parts } from "@echidna/library";
import { useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { freeSchematicSpot, GRID, PART_MIME } from "@/lib/schematic/symbols";
import { symbolBounds, SymbolGlyph } from "./schematic/SymbolGlyph";
import { useProjectStore } from "@/stores/project";
import { useStudioStore } from "@/stores/studio";
import { partKey } from "@/lib/messageKeys";
import { PanelHeader } from "./PanelHeader";
import { PanelEmpty } from "./PanelEmpty";

const categories = [
  { key: "power", kinds: ["supply", "regulator", "ground"] },
  { key: "passives", kinds: ["resistor", "capacitor", "inductor"] },
  { key: "semiconductors", kinds: ["led", "diode"] },
] as const;

const PartIcon = ({ kind }: { kind: string }) => {
  const b = symbolBounds[kind] ?? { w: 2, h: 1 };
  const span = Math.max(b.w, b.h) + 0.6;
  return (
    <svg
      aria-hidden
      viewBox={`${-span * GRID} ${-span * GRID} ${span * 2 * GRID} ${span * 2 * GRID}`}
      className="size-8 shrink-0 rounded-md border bg-background p-1 text-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
    >
      <SymbolGlyph kind={kind} />
    </svg>
  );
};

export const LibrarySidebar = () => {
  const t = useTranslations("Studio.library");
  const tParts = useTranslations("Parts");
  const [query, setQuery] = useState("");
  const select = useStudioStore((s) => s.select);

  const add = (specId: string) => {
    const { addComponent, schematic } = useProjectStore.getState();
    const id = addComponent(specId, freeSchematicSpot(Object.values(schematic)));
    if (id) select({ kind: "component", id });
  };

  const needle = query.trim().toLocaleLowerCase();
  const groups = categories
    .map((c) => ({
      ...c,
      parts: parts.filter(
        (p) =>
          (c.kinds as readonly string[]).includes(p.kind) &&
          (!needle || tParts(`${partKey(p.id)}.name`).toLocaleLowerCase().includes(needle)),
      ),
    }))
    .filter((c) => c.parts.length > 0);

  return (
    <aside aria-label={t("title")} className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <PanelHeader title={t("title")} />
      <div className="p-2">
        <InputGroup className="h-8 bg-background">
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
        <PanelEmpty icon={<Package />} title={t("noMatchTitle")} description={t("noMatchDescription")} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`library-${group.key}`} className="mt-2 first:mt-0">
              <h3 id={`library-${group.key}`} className="px-1 py-1.5 text-xs font-medium text-muted-foreground">
                {t(`categories.${group.key}`)}
              </h3>
              <ul className="flex flex-col gap-0.5">
                {group.parts.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(PART_MIME, p.id);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => add(p.id)}
                      title={t("addHint")}
                      className="flex w-full cursor-grab items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-sm outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                    >
                      <PartIcon kind={p.kind} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{tParts(`${partKey(p.id)}.name`)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {tParts(`${partKey(p.id)}.summary`)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </aside>
  );
};
