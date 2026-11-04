/** Automatic two-layer routing for the 3D board preview. Lengths in board millimetres, x across and z deep. */

export type Layer = "top" | "bottom";
export type Point = [number, number];

/**
 * A pad to connect. Through-hole pads reach both layers; surface-mount pads only the top. `pin` identifies the part
 * pin the pad belongs to, so tracks can say which pads they join. Pads sharing a `pin`, such as a regulator's tab and
 * its middle lead, are joined inside the part and get no track between them.
 */
export type RoutePad = { net: string; x: number; z: number; radius: number; throughHole: boolean; pin?: string };
/**
 * A copper track. `ends` names the pins of the connection it is part of, the first at the end where `points`
 * starts, when both pads have a `pin`. A connection can take more than one track, one per layer it runs on.
 * `unrouted` marks a connection no clear path was found for: its `points` are a straight line between the pads,
 * to be drawn as a reminder, not as copper.
 */
export type Trace = {
  net: string;
  layer: Layer;
  width: number;
  points: Point[];
  ends?: [string, string];
  unrouted?: boolean;
};
export type Via = { net: string; x: number; z: number };
export type Routing = { traces: Trace[]; vias: Via[] };
/** A round area no copper may enter, such as a mounting hole's ring or a fiducial's mask opening. */
export type Keepout = { x: number; z: number; radius: number };
export type RouteOptions = {
  /** Board outline, centred on the origin. Without it, routing may use a margin around the pads. */
  bounds?: { width: number; depth: number };
  keepouts?: readonly Keepout[];
};

/** Copper-to-copper gap kept between nets. */
export const CLEARANCE = 0.25;
/** Via pad diameter; the drill is half of it. */
export const VIA_SIZE = 0.8;
/** Routing grid pitch. */
export const GRID = 0.25;
/** Copper stays this far inside the board edge. */
const EDGE_CLEARANCE = 0.5;
/** Search costs, in millimetres of top-layer track: a via, each 45° of turn, and the bottom layer's surcharge. */
const VIA_COST = 6;
const TURN_COST = 0.4;
const BOTTOM_COST = 1.6;
/**
 * Breathing room: tracks prefer to keep this much more than `CLEARANCE` from other nets' copper and from keepouts,
 * paying `CROWD_COST` extra per millimetre run inside it, so neighbouring tracks spread out instead of hugging.
 */
const ROOM = 0.75;
const CROWD_COST = 0.6;
/** Routing area around the pads when no board outline is given. */
const MARGIN = 5;
/** Search budget per connection, in grid states, so a hopeless connection gives up quickly. */
const MAX_EXPANSIONS = 100_000;
/**
 * Weight on the distance-to-go estimate. Above 1 the search heads for the goal instead of proving its path the
 * cheapest, which is many times faster on a busy board for tracks a little longer at most.
 */
const GREED = 1.3;
/** Longest piece a track is cut into when marking it as an obstacle, so diagonal tracks stamp tight boxes. */
const CHUNK = 2;

const LAYERS = ["top", "bottom"] as const;

/** Copper to keep clear of: a disc when `a` and `b` coincide, otherwise a round-ended track. `net` null is a keepout. */
type Obstacle = { net: string | null; a: Point; b: Point; r: number };

const distanceToSegment = ([px, pz]: Point, [ax, az]: Point, [bx, bz]: Point) => {
  const [dx, dz] = [bx - ax, bz - az];
  const length2 = dx * dx + dz * dz;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / length2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};

const same = (p: Point, q: Point) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;

/** A 45° dogleg from `a` to `b`: diagonal then straight. */
const dogleg = (a: Point, b: Point): Point[] => {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  const d = Math.min(Math.abs(dx), Math.abs(dz));
  const bend: Point = [a[0] + Math.sign(dx) * d, a[1] + Math.sign(dz) * d];
  return same(bend, a) || same(bend, b) ? [a, b] : [a, bend, b];
};

/** Drops repeated points and the middle of any three in a line. */
const simplify = (points: Point[]): Point[] => {
  const out: Point[] = [];
  for (const p of points) {
    if (out.length && same(out[out.length - 1] as Point, p)) continue;
    if (out.length >= 2) {
      const [a, b] = [out[out.length - 2] as Point, out[out.length - 1] as Point];
      if (Math.abs((b[0] - a[0]) * (p[1] - b[1]) - (b[1] - a[1]) * (p[0] - b[0])) < 1e-9) out.pop();
    }
    out.push(p);
  }
  return out;
};

/** A connection to route: the pads of the two pins it joins, and the straight-line gap between their closest pads. */
type Connection = { from: RoutePad[]; to: RoutePad[]; length: number };

/**
 * Connections that join every pin of a net, as a minimum spanning tree over pins by straight-line distance (Prim).
 * Each connection keeps every pad of both pins, so the search can leave and arrive at whichever pad routes best.
 */
const spanningTree = (pads: RoutePad[]): Connection[] => {
  const byPin = new Map<string, RoutePad[]>();
  pads.forEach((pad, i) => {
    const key = pad.pin ?? `#${i}`;
    byPin.set(key, [...(byPin.get(key) ?? []), pad]);
  });
  const groups = [...byPin.values()];
  const closest = (g: RoutePad[], h: RoutePad[]) => {
    let best: [RoutePad, RoutePad, number] | null = null;
    for (const p of g) {
      for (const q of h) {
        const d = Math.hypot(p.x - q.x, p.z - q.z);
        if (!best || d < best[2]) best = [p, q, d];
      }
    }
    return best;
  };
  const inTree = new Set([0]);
  const edges: Connection[] = [];
  while (inTree.size < groups.length) {
    let best: { from: number; to: number; length: number } | null = null;
    for (const i of inTree) {
      for (let j = 0; j < groups.length; j++) {
        if (inTree.has(j)) continue;
        const pair = closest(groups[i] as RoutePad[], groups[j] as RoutePad[]);
        if (pair && (!best || pair[2] < best.length)) best = { from: i, to: j, length: pair[2] };
      }
    }
    if (!best) break;
    edges.push({ from: groups[best.from] as RoutePad[], to: groups[best.to] as RoutePad[], length: best.length });
    inTree.add(best.to);
  }
  return edges;
};

/** Binary min-heap of grid states keyed by estimated total cost. */
class Queue {
  private keys: number[] = [];
  private items: number[] = [];
  get size() {
    return this.items.length;
  }
  push(key: number, item: number) {
    const { keys, items } = this;
    let i = items.length;
    keys.push(key);
    items.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((keys[parent] as number) <= key) break;
      keys[i] = keys[parent] as number;
      items[i] = items[parent] as number;
      i = parent;
    }
    keys[i] = key;
    items[i] = item;
  }
  pop(): number {
    const { keys, items } = this;
    const top = items[0] as number;
    const [lastKey, lastItem] = [keys.pop() as number, items.pop() as number];
    const n = items.length;
    if (n) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && (keys[child + 1] as number) < (keys[child] as number)) child++;
        if ((keys[child] as number) >= lastKey) break;
        keys[i] = keys[child] as number;
        items[i] = items[child] as number;
        i = child;
      }
      keys[i] = lastKey;
      items[i] = lastItem;
    }
    return top;
  }
}

/**
 * Routes every net as a minimum spanning tree of connections, each found by a shortest-path search on a two-layer
 * grid that keeps `CLEARANCE` from every other net's pads, tracks and vias, from keepouts and from the board edge.
 * Tracks run horizontally, vertically or at 45°, prefer the top layer, few bends and some room from other copper,
 * and change layer through a via only where that beats going round. Connections are routed shortest first across
 * all nets, so local links take the direct path and long runs go round them; wider nets go first among equals. A connection with no clear path is returned as an
 * `unrouted` straight line rather than as copper that would short another net. This is a preview, not a checked
 * layout.
 * @param pads - Pads with their nets.
 * @param widthOf - Track width for a net.
 * @param options - Board outline and keepouts.
 * @returns Tracks and vias.
 */
export const route = (pads: RoutePad[], widthOf: (net: string) => number, options: RouteOptions = {}): Routing => {
  const traces: Trace[] = [];
  const vias: Via[] = [];
  const byNet = new Map<string, RoutePad[]>();
  for (const pad of pads) byNet.set(pad.net, [...(byNet.get(pad.net) ?? []), pad]);
  const nets = [...byNet.entries()]
    .filter(([, members]) => members.length > 1)
    .sort(([a, x], [b, y]) => widthOf(b) - widthOf(a) || y.length - x.length || a.localeCompare(b));
  if (nets.length === 0) return { traces, vias };

  // Grid covering the board, or the pads with a margin, aligned to the pitch so whole-millimetre pads sit on nodes.
  const [minX, maxX, minZ, maxZ] = options.bounds
    ? [-options.bounds.width / 2, options.bounds.width / 2, -options.bounds.depth / 2, options.bounds.depth / 2]
    : [
        Math.min(...pads.map((p) => p.x)) - MARGIN,
        Math.max(...pads.map((p) => p.x)) + MARGIN,
        Math.min(...pads.map((p) => p.z)) - MARGIN,
        Math.max(...pads.map((p) => p.z)) + MARGIN,
      ];
  const [x0, z0] = [Math.floor(minX / GRID) * GRID, Math.floor(minZ / GRID) * GRID];
  const nx = Math.floor((maxX - x0) / GRID) + 1;
  const nz = Math.floor((maxZ - z0) / GRID) + 1;
  const n = nx * nz;
  const cellOf = ([x, z]: Point) => {
    const i = Math.min(nx - 1, Math.max(0, Math.round((x - x0) / GRID)));
    const j = Math.min(nz - 1, Math.max(0, Math.round((z - z0) / GRID)));
    return j * nx + i;
  };
  const pointOf = (cell: number): Point => [x0 + (cell % nx) * GRID, z0 + Math.floor(cell / nx) * GRID];
  /** Grid columns and rows whose cells keep `inset` from the board edge. */
  const inside = (inset: number) =>
    options.bounds
      ? {
          i0: Math.max(0, Math.ceil((minX + inset - x0) / GRID)),
          i1: Math.min(nx - 1, Math.floor((maxX - inset - x0) / GRID)),
          j0: Math.max(0, Math.ceil((minZ + inset - z0) / GRID)),
          j1: Math.min(nz - 1, Math.floor((maxZ - inset - z0) / GRID)),
        }
      : { i0: 0, i1: nx - 1, j0: 0, j1: nz - 1 };

  // Who blocks each cell, kept up to date as copper is added rather than rebuilt for every net. There is one map per
  // layer for each clearance in use: each track half-width, and a via. A cell holds 0 when free, a net's number when
  // only that net's copper is too close, and SHARED when keepouts or two nets are, which blocks every net.
  const SHARED = -1;
  const netId = new Map(nets.map(([net], k) => [net, k + 1]));
  const halves = [...new Set(nets.map(([net]) => widthOf(net) / 2))];
  // The last map is soft: it marks the breathing room round copper, which costs extra but never blocks.
  const reaches = [...halves, VIA_SIZE / 2, Math.max(...halves) + ROOM];
  const owners = reaches.map(() => [new Int16Array(n), new Int16Array(n)] as const);
  const viaClass = halves.length;
  const roomClass = halves.length + 1;

  const cellsNear = (o: Pick<Obstacle, "a" | "b">, r: number, visit: (cell: number) => void) => {
    const i0 = Math.max(0, Math.ceil((Math.min(o.a[0], o.b[0]) - r - x0) / GRID));
    const i1 = Math.min(nx - 1, Math.floor((Math.max(o.a[0], o.b[0]) + r - x0) / GRID));
    const j0 = Math.max(0, Math.ceil((Math.min(o.a[1], o.b[1]) - r - z0) / GRID));
    const j1 = Math.min(nz - 1, Math.floor((Math.max(o.a[1], o.b[1]) + r - z0) / GRID));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (distanceToSegment([x0 + i * GRID, z0 + j * GRID], o.a, o.b) < r) visit(j * nx + i);
      }
    }
  };
  /** Records copper (or a keepout, with `net` null) on a layer in every clearance map. */
  const addObstacle = (layer: number, o: Obstacle) => {
    const id = o.net === null ? SHARED : (netId.get(o.net) ?? SHARED);
    const length = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]);
    const pieces = Math.max(1, Math.ceil(length / CHUNK));
    for (let k = 0; k < pieces; k++) {
      const at = (t: number): Point => [o.a[0] + (o.b[0] - o.a[0]) * t, o.a[1] + (o.b[1] - o.a[1]) * t];
      const piece = { a: at(k / pieces), b: at((k + 1) / pieces) };
      reaches.forEach((reach, c) => {
        const grid = (owners[c] as readonly [Int16Array, Int16Array])[layer] as Int16Array;
        cellsNear(piece, o.r + reach + CLEARANCE, (cell) => {
          const held = grid[cell] as number;
          grid[cell] = held === 0 || held === id ? id : SHARED;
        });
      });
    }
  };
  for (const pad of pads) {
    const disc = { net: pad.net, a: [pad.x, pad.z] as Point, b: [pad.x, pad.z] as Point, r: pad.radius };
    addObstacle(0, disc);
    if (pad.throughHole) addObstacle(1, disc);
  }
  for (const k of options.keepouts ?? []) {
    for (const layer of [0, 1]) addObstacle(layer, { net: null, a: [k.x, k.z], b: [k.x, k.z], r: k.radius });
  }

  // Search state, reused across connections: `seen`, `closed` and `open` hold the current search's stamp when valid.
  const cost = new Float32Array(2 * n);
  const parent = new Int32Array(2 * n);
  const heading = new Int8Array(2 * n);
  const seen = new Uint32Array(2 * n);
  const closed = new Uint32Array(2 * n);
  /** Cells inside the connection's own end pads, which are reachable even within another net's clearance. */
  const open = new Uint32Array(2 * n);
  /** Cells where this net may not put a via: on or beside its own pads. Holds the net's number. */
  const padVia = new Uint32Array(n);
  /** States on the centre of a pad the current search may finish on. */
  const goalAt = new Uint32Array(2 * n);
  let search = 0;
  const DI = [1, 1, 0, -1, -1, -1, 0, 1];
  const DJ = [0, 1, 1, 1, 0, -1, -1, -1];

  const connections = nets
    .flatMap(([net, members]) => spanningTree(members).map((connection) => ({ net, members, ...connection })))
    .sort((a, b) => a.length - b.length || widthOf(b.net) - widthOf(a.net) || a.net.localeCompare(b.net));

  for (const connection of connections) {
    const { net, members } = connection;
    const id = netId.get(net) as number;
    const half = widthOf(net) / 2;
    const [topOwner, bottomOwner] = owners[halves.indexOf(half)] as readonly [Int16Array, Int16Array];
    const [viaTop, viaBottom] = owners[viaClass] as readonly [Int16Array, Int16Array];
    const [roomTop, roomBottom] = owners[roomClass] as readonly [Int16Array, Int16Array];
    const track = inside(EDGE_CLEARANCE + half);
    const viaArea = inside(EDGE_CLEARANCE + VIA_SIZE / 2);
    for (const pad of members) {
      cellsNear({ a: [pad.x, pad.z], b: [pad.x, pad.z] }, pad.radius + VIA_SIZE / 2, (c) => (padVia[c] = id));
    }

    type Path = { cells: { layer: number; cell: number }[]; from: RoutePad; to: RoutePad };
    /** Cheapest path from any pad of one pin to any pad of the other, as layer-tagged cells, or null when none fits. */
    const findPath = (sources: RoutePad[], targets: RoutePad[]): Path | null => {
      search++;
      for (const pad of [...sources, ...targets]) {
        cellsNear({ a: [pad.x, pad.z], b: [pad.x, pad.z] }, pad.radius, (c) => {
          open[c] = search;
          if (pad.throughHole) open[n + c] = search;
        });
      }
      const free = (layer: number, cell: number) => {
        if (open[layer * n + cell] === search) return true;
        const i = cell % nx;
        const j = (cell - i) / nx;
        if (i < track.i0 || i > track.i1 || j < track.j0 || j > track.j1) return false;
        const held = (layer ? bottomOwner : topOwner)[cell] as number;
        return held === 0 || held === id;
      };
      const viaFits = (cell: number) => {
        const i = cell % nx;
        const j = (cell - i) / nx;
        if (i < viaArea.i0 || i > viaArea.i1 || j < viaArea.j0 || j > viaArea.j1 || padVia[cell] === id) return false;
        const [t, b] = [viaTop[cell] as number, viaBottom[cell] as number];
        return (t === 0 || t === id) && (b === 0 || b === id);
      };

      const goals = targets.map((pad) => {
        const cell = cellOf([pad.x, pad.z]);
        goalAt[cell] = search;
        if (pad.throughHole) goalAt[n + cell] = search;
        return { pad, cell, i: cell % nx, j: Math.floor(cell / nx) };
      });
      const goalBottom = targets.some((pad) => pad.throughHole);
      const queue = new Queue();
      const relax = (state: number, value: number, previous: number, dir: number) => {
        if (seen[state] === search && value >= (cost[state] as number)) return;
        seen[state] = search;
        cost[state] = value;
        parent[state] = previous;
        heading[state] = dir;
        const cell = state % n;
        const [ci, cj] = [cell % nx, Math.floor(cell / nx)];
        let estimate = Infinity;
        for (const goal of goals) {
          const [di, dj] = [Math.abs(ci - goal.i), Math.abs(cj - goal.j)];
          estimate = Math.min(estimate, (Math.max(di, dj) + (Math.SQRT2 - 1) * Math.min(di, dj)) * GRID);
        }
        queue.push(value + GREED * estimate + (state >= n && !goalBottom ? VIA_COST : 0), state);
      };
      for (const pad of sources) {
        const start = cellOf([pad.x, pad.z]);
        relax(start, 0, -1, -1);
        if (pad.throughHole) relax(n + start, 0, -1, -1);
      }

      for (let expanded = 0; queue.size && expanded < MAX_EXPANSIONS; expanded++) {
        const state = queue.pop();
        if (closed[state] === search) continue;
        closed[state] = search;
        const layer = state >= n ? 1 : 0;
        const cell = state - layer * n;
        if (goalAt[state] === search) {
          const cells: { layer: number; cell: number }[] = [];
          for (let s = state; s !== -1; s = parent[s] as number) cells.push({ layer: s >= n ? 1 : 0, cell: s % n });
          cells.reverse();
          const start = (cells[0] as { cell: number }).cell;
          const from = sources.find((pad) => cellOf([pad.x, pad.z]) === start) as RoutePad;
          const to = goals.find((goal) => goal.cell === cell)?.pad as RoutePad;
          return { cells, from, to };
        }
        const i = cell % nx;
        const j = (cell - i) / nx;
        const dir = heading[state] as number;
        const base = cost[state] as number;
        const unit = GRID * (layer ? BOTTOM_COST : 1);
        for (let m = 0; m < 8; m++) {
          const [ni, nj] = [i + (DI[m] as number), j + (DJ[m] as number)];
          if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
          const turn = dir < 0 ? 0 : Math.min(Math.abs(dir - m), 8 - Math.abs(dir - m));
          if (turn > 2) continue;
          const next = nj * nx + ni;
          if (!free(layer, next)) continue;
          const diagonal = m % 2 === 1;
          // A diagonal step must not cut a blocked corner.
          if (diagonal && (!free(layer, j * nx + ni) || !free(layer, nj * nx + i))) continue;
          const crowd = (layer ? roomBottom : roomTop)[next] as number;
          const crowded = crowd !== 0 && crowd !== id && open[layer * n + next] !== search;
          const run = unit + (crowded ? GRID * CROWD_COST : 0);
          const step = (diagonal ? Math.SQRT2 : 1) * run + (turn === 2 ? 3 : turn) * TURN_COST;
          relax(layer * n + next, base + step, state, m);
        }
        if (viaFits(cell)) relax((1 - layer) * n + cell, base + VIA_COST, state, dir);
      }
      return null;
    };

    const width = half * 2;
    const found = findPath(connection.from, connection.to);
    if (!found) {
      const [from, to] = [connection.from[0] as RoutePad, connection.to[0] as RoutePad];
      const ends: Pick<Trace, "ends"> = from.pin && to.pin ? { ends: [from.pin, to.pin] } : {};
      traces.push({ net, layer: "top", width, points: [[from.x, from.z], [to.x, to.z]], unrouted: true, ...ends });
      continue;
    }
    const { cells: path, from, to } = found;
    const ends: Pick<Trace, "ends"> = from.pin && to.pin ? { ends: [from.pin, to.pin] } : {};
    // Split the path into one track per layer run, with a via at each change.
    const runs: { layer: number; points: Point[] }[] = [];
    for (const { layer, cell } of path) {
      const last = runs[runs.length - 1];
      if (last && last.layer === layer) last.points.push(pointOf(cell));
      else {
        if (last) {
          const [x, z] = pointOf(cell);
          vias.push({ net, x, z });
          for (const side of [0, 1]) addObstacle(side, { net, a: [x, z], b: [x, z], r: VIA_SIZE / 2 });
        }
        runs.push({ layer, points: [pointOf(cell)] });
      }
    }
    const [first, last] = [runs[0], runs[runs.length - 1]];
    if (!first || !last) continue;
    // Run the ends into the pad centres with 45° jogs, hidden under the pads.
    first.points = [...dogleg([from.x, from.z], first.points[0] as Point), ...first.points.slice(1)];
    last.points = [...last.points.slice(0, -1), ...dogleg(last.points[last.points.length - 1] as Point, [to.x, to.z])];
    for (const run of runs) {
      const points = simplify(run.points);
      traces.push({ net, layer: LAYERS[run.layer] as Layer, width, points, ...ends });
      for (let p = 1; p < points.length; p++) {
        addObstacle(run.layer, { net, a: points[p - 1] as Point, b: points[p] as Point, r: half });
      }
    }
  }
  return { traces, vias };
};
