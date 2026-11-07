import type en from "@/languages/en.json";

/** Message keys driven by data. `messageKeys.test.ts` checks every part, rule and parameter has messages. */
export type PartMessageId = keyof typeof en.Parts;
export type RuleMessageId = keyof typeof en.Studio.rules;
export type ParamMessageId = keyof typeof en.Studio.params;
export type SlotMessageId = keyof typeof en.Studio.slots.names;
export type ProtocolMessageId = keyof typeof en.Studio.slots.protocols;
export type ConnectorMessageId = keyof typeof en.Studio.slots.connectors;
export type BuildMessageId = keyof typeof en.Builds;
export type DeviceMessageId = keyof typeof en.Studio.slots.devices;
export type PmicRailMessageId = keyof typeof en.Studio.slots.pmicRails;
export type BoardMessageId = keyof typeof en.Studio.slots.boards;

export const partKey = (specId: string) => specId as PartMessageId;
export const ruleKey = (ruleId: string) => ruleId as RuleMessageId;
export const paramKey = (param: string) => param as ParamMessageId;
export const slotKey = (slotId: string) => slotId as SlotMessageId;
export const protocolKey = (protocol: string) => protocol as ProtocolMessageId;
export const connectorKey = (connector: string) => connector as ConnectorMessageId;
export const buildKey = (buildId: string) => buildId as BuildMessageId;
export const deviceKey = (connector: string) => connector as DeviceMessageId;
export const pmicRailKey = (railId: string) => railId as PmicRailMessageId;
export const boardKey = (boardId: string) => boardId as BoardMessageId;
