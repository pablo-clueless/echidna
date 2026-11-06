import { type ComponentSpec, isHostModule, type ModuleRole, type Violation } from "@echidna/core";
import { checkBuild, type FitCheck } from "@echidna/rules";

import type { ProjectData } from "./model";
import { modulesIn } from "./slots";

type Project = Pick<ProjectData, "components" | "slots">;

/** The rules a desktop build is checked against, each with a name and explanation in `Studio.rules`. */
export const BUILD_RULE_IDS = [
  "psuBudget",
  "chargerBudget",
  "powerConnectors",
  "cooling",
  "thrustToWeight",
  "escCurrent",
  "batteryDischarge",
] as const;

/**
 * The part each build check is about: the PSU or charger for power, the cooler for cooling, and on a drone the motors
 * for lift, the ESC for its current and the battery for its discharge. A drone with ESCs built into its frame has no
 * ESC part, so that check falls back to the frame.
 */
const ownerRole: Record<string, ModuleRole> = {
  psuBudget: "psu",
  chargerBudget: "charger",
  powerConnectors: "psu",
  cooling: "cooler",
  thrustToWeight: "motors",
  escCurrent: "esc",
  batteryDischarge: "battery",
};

/**
 * The device-level checks of every desktop and laptop build in the project, as rule violations on the part each is about, so
 * the validator and inspector show them alongside the circuit's. Passes are included, as the rule engine's are.
 * @param project - Parts and slot placements.
 * @param specs - Part specs by ID.
 * @returns One violation per build check.
 */
export const buildViolations = (
  project: Project,
  specs: ReadonlyMap<string, ComponentSpec>,
): Violation[] =>
  project.components.flatMap((host) => {
    const spec = specs.get(host.specId);
    if (!spec || !isHostModule(spec)) return [];
    const ownerOf = (check: FitCheck) =>
      project.components.find(
        (c) =>
          project.slots[c.id]?.hostId === host.id &&
          specs.get(c.specId)?.module?.role === ownerRole[check.id],
      )?.id ?? host.id;
    const checks = checkBuild(spec, modulesIn(project, specs, host.id));
    // One connector verdict per build, the worst, as each rule gives one verdict per part.
    const connectors = checks.filter((c) => c.id === "powerConnectors");
    const worstConnector = connectors.find((c) => c.severity === "fail") ?? connectors[0];
    return checks
      .filter((c) => c.id !== "powerConnectors" || c === worstConnector)
      .map((check): Violation => ({
        componentId: ownerOf(check),
        ruleId: check.id,
        actual: check.actual ?? 0,
        limit: check.limit ?? 0,
        unit: check.unit ?? "1",
        severity: check.severity,
        estimated: check.estimated,
      }));
  });
