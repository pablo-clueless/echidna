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
  /** Chosen variant of the part, such as an LED colour. */
  variant?: string;
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
