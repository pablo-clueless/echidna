"use client";

import "prismjs/themes/prism.min.css";
import { Check, Code2, Copy, Download } from "lucide-react";
import loadLanguages from "prismjs/components/index.js";
import { useEffect, useMemo, useState } from "react";
import { parts, partsById } from "@echidna/library";
import Prism, { type Grammar } from "prismjs";
import { useTranslations } from "next-intl";

import { CODE_LANGUAGES, type CodeLanguage, firmwareTarget, generateCode } from "@/lib/codegen";
import { projectPinout } from "@/lib/export/pinout";
import { useProjectStore } from "@/stores/project";
import { Button } from "@/components/ui/button";
import { IconButton } from "../app/IconButton";
import { partKey } from "@/lib/messageKeys";
import { PanelHeader } from "./PanelHeader";
import { EmptyContent } from "../ui/empty";
import { TabList } from "../ui/tab-panel";
import { PanelEmpty } from "./PanelEmpty";

const LABELS: Record<CodeLanguage, string> = {
  c: "C",
  cpp: "C++",
  go: "Go",
  rust: "Rust",
  java: "Java",
};
/** The wiring table sits after the languages, as its own tab. */
const WIRING = "wiring";
type Tab = CodeLanguage | typeof WIRING;

loadLanguages([...CODE_LANGUAGES]);

/** How long the copy button shows its tick, in milliseconds. */
const COPIED_MS = 1500;

/** Dev boards code can be written for, offered when the project has none. */
const devBoards = parts.filter((p) => p.host && p.kind === "devBoard");

/**
 * Starter code for the project's dev board in C, C++, Go, Rust or Java, generated from what is plugged into its slots
 * and wired to its pins, and a wiring table of every net.
 */
export const CodeOutputPanel = () => {
  const t = useTranslations("Studio.output");
  const tParts = useTranslations("Parts");
  const [tab, setTab] = useState<Tab>("c");
  const [copied, setCopied] = useState(false);
  const components = useProjectStore((s) => s.components);
  const wires = useProjectStore((s) => s.wires);
  const slots = useProjectStore((s) => s.slots);
  const language = tab === WIRING ? null : tab;

  const generated = useMemo(
    () => (language ? generateCode({ components, wires, slots }, partsById, language) : null),
    [components, wires, slots, language],
  );
  const pinout = useMemo(
    () => projectPinout({ components, wires, slots }, partsById),
    [components, wires, slots],
  );
  const hasBoard = useMemo(
    () => firmwareTarget({ components, wires, slots }, partsById) !== null,
    [components, wires, slots],
  );
  const html = useMemo(() => {
    if (!generated || !language) return "";
    const grammar = Prism.languages[language] as Grammar | undefined;
    return grammar
      ? Prism.highlight(generated.code, grammar, language)
      : generated.code.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`);
  }, [generated, language]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    if (!generated) return;
    await navigator.clipboard.writeText(generated.code);
    setCopied(true);
  };
  const download = () => {
    if (!generated) return;
    const url = URL.createObjectURL(new Blob([generated.code], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = generated.fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const tabs = [
    ...CODE_LANGUAGES.map((value) => ({ label: LABELS[value], value })),
    { label: t("wiring"), value: WIRING },
  ];
  const showTabs = hasBoard || pinout.nets.length > 0;

  return (
    <section aria-label={t("title")} className="flex h-full flex-col">
      <PanelHeader title={t("title")}>
        {generated && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground mr-1 font-mono text-xs max-sm:hidden">
              {generated.fileName}
            </span>
            <IconButton label={copied ? t("copied") : t("copy")} onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />}
            </IconButton>
            <IconButton label={t("download")} onClick={download}>
              <Download />
            </IconButton>
          </div>
        )}
      </PanelHeader>
      {showTabs ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <TabList
            onTabChange={(value) => setTab(value as Tab)}
            tab={tab}
            tabs={tabs}
            className="border-b"
          />
          <div className="min-h-0 flex-1 overflow-auto">
            {tab === WIRING ? (
              <WiringTable pinout={pinout} />
            ) : generated ? (
              <pre className={`language-${tab} m-0! min-h-full rounded-none! text-xs!`}>
                <code className={`language-${tab}`} dangerouslySetInnerHTML={{ __html: html }} />
              </pre>
            ) : (
              <p className="text-muted-foreground p-4 text-xs">{t("needsBoard")}</p>
            )}
          </div>
        </div>
      ) : (
        <PanelEmpty icon={<Code2 />} title={t("emptyTitle")} description={t("emptyDescription")}>
          <EmptyContent>
            <div className="flex flex-wrap justify-center gap-1.5">
              {devBoards.map((board) => (
                <Button
                  key={board.id}
                  size="xs"
                  variant="ghost"
                  onClick={() => useProjectStore.getState().loadPreset(board.id)}
                >
                  {t("startFromBoard", { board: tParts(`${partKey(board.id)}.name`) })}
                </Button>
              ))}
            </div>
          </EmptyContent>
        </PanelEmpty>
      )}
    </section>
  );
};

/** Every net with the pins on it, then which host pin each plugged-in part's pins go to. */
const WiringTable = ({ pinout }: { pinout: ReturnType<typeof projectPinout> }) => {
  const t = useTranslations("Studio.output.table");
  if (pinout.nets.length === 0 && pinout.slots.length === 0)
    return <p className="text-muted-foreground p-4 text-xs">{t("empty")}</p>;
  return (
    <div className="grid gap-4 p-3 text-xs">
      {pinout.slots.length > 0 && (
        <table className="w-full border-collapse">
          <caption className="text-muted-foreground mb-1 text-left font-medium">
            {t("slotsCaption")}
          </caption>
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="py-1 pr-2 font-medium">{t("part")}</th>
              <th className="py-1 pr-2 font-medium">{t("pin")}</th>
              <th className="py-1 pr-2 font-medium">{t("hostPin")}</th>
              <th className="py-1 font-medium">{t("signal")}</th>
            </tr>
          </thead>
          <tbody>
            {pinout.slots.map((row) => (
              <tr key={`${row.partId}/${row.pin}`} className="border-b last:border-0">
                <td className="py-1 pr-2">
                  <span className="font-mono">{row.partId}</span>{" "}
                  <span className="text-muted-foreground">{row.part}</span>
                </td>
                <td className="py-1 pr-2 font-mono">{row.pin}</td>
                <td className="py-1 pr-2 font-mono">
                  {row.hostId} {row.hostPin}
                </td>
                <td className="py-1 font-mono">{row.signal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pinout.nets.length > 0 && (
        <table className="w-full border-collapse">
          <caption className="text-muted-foreground mb-1 text-left font-medium">
            {t("netsCaption")}
          </caption>
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="py-1 pr-2 font-medium">{t("net")}</th>
              <th className="py-1 font-medium">{t("pins")}</th>
            </tr>
          </thead>
          <tbody>
            {pinout.nets.map((row) => (
              <tr key={row.net} className="border-b align-top last:border-0">
                <td className="py-1 pr-2 font-mono whitespace-nowrap">{row.net}</td>
                <td className="py-1 font-mono">
                  {row.pins.map((p) => `${p.componentId}.${p.pin}`).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
