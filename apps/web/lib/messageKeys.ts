import type en from "@/messages/en.json";

/** Message keys driven by data. `messageKeys.test.ts` checks every part, rule and parameter has messages. */
export type PartMessageId = keyof typeof en.Parts;
export type RuleMessageId = keyof typeof en.Studio.rules;
export type ParamMessageId = keyof typeof en.Studio.params;

export const partKey = (specId: string) => specId as PartMessageId;
export const ruleKey = (ruleId: string) => ruleId as RuleMessageId;
export const paramKey = (param: string) => param as ParamMessageId;
