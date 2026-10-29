import type { Device } from "./layout";
import type { Netlist } from "./netlist";

export type Project = {
  id: string;
  name: string;
  schemaVersion: 1;
  device: Device;
  netlist: Netlist;
  createdAt: string;
  updatedAt: string;
};
