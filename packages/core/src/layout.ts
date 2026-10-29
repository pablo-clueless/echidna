import type { DeviceType, Interface, SpecValue } from "./specs";

export type Vec3 = [number, number, number];

export type LayerKind = "copper" | "dielectric" | "soldermask" | "silkscreen";

export type Layer = {
  index: number;
  name: string;
  kind: LayerKind;
  thickness: number;
};

export type LayerStack = {
  layers: Layer[];
};

export type Rail = {
  id: string;
  name: string;
  voltage: SpecValue;
  maxCurrent: SpecValue;
};

export type Slot = {
  id: string;
  name: string;
  accepts: Interface[];
  railIds: string[];
  thermalBudget?: SpecValue;
  position: Vec3;
};

export type PlacedComponent = {
  id: string;
  specId: string;
  slotId?: string;
  position: Vec3;
  rotation: Vec3;
  layer: number;
};

export type BoardOutline = {
  points: Array<[number, number]>;
};

export type Board = {
  id: string;
  name: string;
  outline: BoardOutline;
  stack: LayerStack;
  rails: Rail[];
  slots: Slot[];
  components: PlacedComponent[];
  position: Vec3;
  rotation: Vec3;
};

export type Device = {
  id: string;
  name: string;
  type: DeviceType;
  presetId?: string;
  boards: Board[];
};
