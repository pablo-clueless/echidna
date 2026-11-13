import type { ComponentSpec } from "@echidna/core";

import { type FirmwareTarget, firmwareTarget } from "./model";
import type { CodeLanguage, GeneratedCode } from "./common";
import type { ProjectData } from "@/lib/project/model";
import { generateRust } from "./rust";
import { generateJava } from "./java";
import { generateCpp } from "./cpp";
import { generateGo } from "./go";
import { generateC } from "./c";

export { CODE_LANGUAGES, type CodeLanguage, type GeneratedCode } from "./common";
export { type FirmwareTarget, firmwareTarget } from "./model";

const generators: Record<CodeLanguage, (target: FirmwareTarget) => GeneratedCode> = {
  c: generateC,
  cpp: generateCpp,
  go: generateGo,
  rust: generateRust,
  java: generateJava,
};

/**
 * Starter code for the project's dev board in one language: set up every sensor plugged into its slots and every
 * GPIO pin with parts wired to it, then print a reading from each once a second, blinking any outputs.
 * @param project - The open project.
 * @param specs - Part lookup by spec ID.
 * @param language - The language to write.
 * @returns The code and its file name, or `null` when the project has no dev board.
 */
export const generateCode = (
  project: Pick<ProjectData, "components" | "wires" | "slots">,
  specs: ReadonlyMap<string, ComponentSpec>,
  language: CodeLanguage,
): GeneratedCode | null => {
  const target = firmwareTarget(project, specs);
  return target && generators[language](target);
};
