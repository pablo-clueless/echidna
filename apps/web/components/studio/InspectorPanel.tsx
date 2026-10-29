"use client";

import { compareViolations, type ComponentSpec, type NetlistComponent } from "@echidna/core";
import { useLocale, useTranslations } from "next-intl";
import { MousePointerClick } from "lucide-react";
import { partsById } from "@echidna/library";
import { useMemo } from "react";

import { deriveNets, MODEL_PARAMS, paramValue } from "@/lib/project/model";
import { SwapSuggestions } from "./inspector/SwapSuggestions";
import { RatingMeter } from "./inspector/RatingMeter";
import { paramKey, partKey } from "@/lib/messageKeys";
import { ParamField } from "./inspector/ParamField";
import { useProjectStore } from "@/stores/project";
import { swapParam } from "@/lib/simulation/swaps";
import { useStudioStore } from "@/stores/studio";
import { formatQuantity } from "@/lib/units";
import { PanelHeader } from "./PanelHeader";
import { PanelEmpty } from "./PanelEmpty";

const Readout = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="font-mono tabular-nums">{value}</dd>
  </div>
);

const ComponentInspector = ({ component, spec }: { component: NetlistComponent; spec: ComponentSpec }) => {
  const t = useTranslations("Studio.inspector");
  const tParts = useTranslations("Parts");
  const tParams = useTranslations("Studio.params");
  const locale = useLocale();
  const setParam = useProjectStore((s) => s.setParam);
  const simulation = useStudioStore((s) => s.simulation);
  const violations = useStudioStore((s) => s.violations);

  const element = simulation?.build.circuit.elements.find((e) => e.id === component.id);
  const solution = simulation?.solution;
  const checks = violations.filter((v) => v.componentId === component.id).sort(compareViolations);
  const swap = swapParam(spec);
  const params = Object.entries(spec.params).filter(([key]) => !MODEL_PARAMS.has(key));

  const readouts =
    element && solution
      ? [
          ...spec.pins.map((pin, i) => ({
            label: t("pinVoltage", { pin: pin.name }),
            value: formatQuantity(solution.nodeVoltages[element.nodes[i] ?? ""] ?? 0, "V", locale),
          })),
          {
            label: t("current"),
            value: formatQuantity(
              Math.max(0, ...(solution.pinCurrents[component.id] ?? []).map(Math.abs)),
              "A",
              locale,
            ),
          },
          { label: t("power"), value: formatQuantity(Math.max(0, solution.componentPower[component.id] ?? 0), "W", locale) },
        ]
      : [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="@container grid gap-5 p-3">
        <div className="grid gap-0.5">
          <p className="font-mono text-base font-semibold">{component.id}</p>
          <p className="text-sm text-muted-foreground">{tParts(`${partKey(spec.id)}.name`)}</p>
        </div>

        {params.length > 0 && (
          <section aria-labelledby="params-heading" className="grid gap-3">
            <h3 id="params-heading" className="text-xs font-medium text-muted-foreground">
              {t("parameters")}
            </h3>
            {params.map(([key, value]) => (
              <ParamField
                key={`${component.id}:${key}`}
                name={key}
                label={tParams(paramKey(key))}
                spec={value}
                value={paramValue(component, spec, key) ?? value.value}
                overridden={component.paramOverrides?.[key] !== undefined}
                onCommit={(v) => setParam(component.id, key, v)}
              />
            ))}
          </section>
        )}

        {readouts.length > 0 && (
          <section aria-labelledby="live-heading" className="grid gap-1">
            <h3 id="live-heading" className="text-xs font-medium text-muted-foreground">
              {t("liveValues")}
            </h3>
            <dl>
              {readouts.map((r) => (
                <Readout key={r.label} {...r} />
              ))}
            </dl>
          </section>
        )}

        {checks.length > 0 && (
          <section aria-labelledby="checks-heading" className="grid gap-3">
            <h3 id="checks-heading" className="text-xs font-medium text-muted-foreground">
              {t("ratings")}
            </h3>
            {checks.map((v) => (
              <RatingMeter key={v.ruleId} violation={v} />
            ))}
          </section>
        )}

        {swap && <SwapSuggestions component={component} param={swap} />}
      </div>
    </div>
  );
};

const WireInspector = ({ wireId }: { wireId: string }) => {
  const t = useTranslations("Studio.inspector");
  const locale = useLocale();
  const wires = useProjectStore((s) => s.wires);
  const simulation = useStudioStore((s) => s.simulation);
  const wire = wires.find((w) => w.id === wireId);
  const net = useMemo(
    () => (wire ? deriveNets(wires).find((n) => n.pins.some((p) => p.componentId === wire.a.componentId && p.pinId === wire.a.pinId)) : undefined),
    [wires, wire],
  );
  if (!wire || !net) return null;
  const node = simulation?.build.netNodes[net.id];
  const voltage = node === undefined ? undefined : simulation?.solution?.nodeVoltages[node];

  return (
    <div className="grid flex-1 content-start gap-4 overflow-y-auto p-3">
      <p className="font-mono text-base font-semibold">{t("net")}</p>
      <dl>
        {voltage !== undefined && <Readout label={t("netVoltage")} value={formatQuantity(voltage, "V", locale)} />}
        <Readout label={t("connections")} value={net.pins.map((p) => `${p.componentId}.${p.pinId}`).join(", ")} />
      </dl>
    </div>
  );
};

export const InspectorPanel = () => {
  const t = useTranslations("Studio.inspector");
  const selection = useStudioStore((s) => s.selection);
  const component = useProjectStore((s) =>
    selection?.kind === "component" ? s.components.find((c) => c.id === selection.id) : undefined,
  );
  const spec = component ? partsById.get(component.specId) : undefined;

  return (
    <section aria-label={t("title")} className="flex h-full flex-col">
      <PanelHeader title={t("title")} />
      {component && spec ? (
        <ComponentInspector component={component} spec={spec} />
      ) : selection?.kind === "wire" ? (
        <WireInspector wireId={selection.id} />
      ) : (
        <PanelEmpty icon={<MousePointerClick />} title={t("emptyTitle")} description={t("emptyDescription")} />
      )}
    </section>
  );
};
