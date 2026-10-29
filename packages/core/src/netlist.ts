export type PinRef = {
  componentId: string;
  pinId: string;
};

export type Net = {
  id: string;
  name?: string;
  pins: PinRef[];
};

export type NetlistComponent = {
  id: string;
  specId: string;
  paramOverrides?: Record<string, number>;
};

export type Netlist = {
  components: NetlistComponent[];
  nets: Net[];
  groundNetId: string;
};

export type SolveResult = {
  nodeVoltages: Record<string, number>;
  branchCurrents: Record<string, number>;
  componentPower: Record<string, number>;
};
