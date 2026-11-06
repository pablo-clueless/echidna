/**
 * A single-stroke font for silkscreen text, which Gerber can only draw as lines. Each glyph is a list of strokes on a
 * grid 4 units wide and 6 tall, y up, baseline at 0.
 */
const GLYPHS: Record<string, string> = {
  A: "0,0 0,4 2,6 4,4 4,0;0,3 4,3",
  B: "0,0 0,6 3,6 4,5 4,4 3,3 0,3;3,3 4,2 4,1 3,0 0,0",
  C: "4,5 3,6 1,6 0,5 0,1 1,0 3,0 4,1",
  D: "0,0 0,6 3,6 4,5 4,1 3,0 0,0",
  E: "4,6 0,6 0,0 4,0;0,3 3,3",
  F: "4,6 0,6 0,0;0,3 3,3",
  G: "4,5 3,6 1,6 0,5 0,1 1,0 3,0 4,1 4,3 2,3",
  H: "0,0 0,6;4,0 4,6;0,3 4,3",
  I: "1,6 3,6;2,6 2,0;1,0 3,0",
  J: "4,6 4,1 3,0 1,0 0,1",
  K: "0,0 0,6;4,6 0,2;1,3 4,0",
  L: "0,6 0,0 4,0",
  M: "0,0 0,6 2,3 4,6 4,0",
  N: "0,0 0,6 4,0 4,6",
  O: "1,0 0,1 0,5 1,6 3,6 4,5 4,1 3,0 1,0",
  P: "0,0 0,6 3,6 4,5 4,4 3,3 0,3",
  Q: "1,0 0,1 0,5 1,6 3,6 4,5 4,1 3,0 1,0;2,2 4,0",
  R: "0,0 0,6 3,6 4,5 4,4 3,3 0,3;2,3 4,0",
  S: "4,5 3,6 1,6 0,5 0,4 1,3 3,3 4,2 4,1 3,0 1,0 0,1",
  T: "0,6 4,6;2,6 2,0",
  U: "0,6 0,1 1,0 3,0 4,1 4,6",
  V: "0,6 2,0 4,6",
  W: "0,6 1,0 2,3 3,0 4,6",
  X: "0,0 4,6;0,6 4,0",
  Y: "0,6 2,3 4,6;2,3 2,0",
  Z: "0,6 4,6 0,0 4,0",
  "0": "1,0 0,1 0,5 1,6 3,6 4,5 4,1 3,0 1,0;0,1 4,5",
  "1": "1,5 2,6 2,0;1,0 3,0",
  "2": "0,5 1,6 3,6 4,5 4,4 0,0 4,0",
  "3": "0,5 1,6 3,6 4,5 4,4 3,3 4,2 4,1 3,0 1,0 0,1;1,3 3,3",
  "4": "3,0 3,6 0,2 4,2",
  "5": "4,6 0,6 0,3 3,3 4,2 4,1 3,0 0,0",
  "6": "3,6 1,6 0,5 0,1 1,0 3,0 4,1 4,2 3,3 0,3",
  "7": "0,6 4,6 1,0",
  "8": "1,3 0,4 0,5 1,6 3,6 4,5 4,4 3,3 1,3 0,2 0,1 1,0 3,0 4,1 4,2 3,3",
  "9": "4,3 1,3 0,4 0,5 1,6 3,6 4,5 4,1 3,0 1,0",
  "+": "2,1 2,5;0,3 4,3",
  "-": "1,3 3,3",
  "−": "1,3 3,3",
  ".": "2,0 2,0.4",
  "/": "0,0 4,6",
};

const parsed = new Map(
  Object.entries(GLYPHS).map(([char, strokes]) => [
    char,
    strokes
      .split(";")
      .map((stroke) =>
        stroke.split(" ").map((point) => point.split(",").map(Number) as [number, number]),
      ),
  ]),
);

/** Glyph advance in grid units: a glyph's 4 units and a gap of 1.5. */
const ADVANCE = 5.5;

/**
 * Strokes that write a line of text, centred on a point. Letters are drawn as capitals; characters the font has no
 * glyph for leave a gap.
 * @param text - What to write.
 * @param height - Capital height, in millimetres.
 * @param cx - Centre across, in millimetres.
 * @param cy - Centre up, in millimetres, y up.
 * @returns Polylines in millimetres.
 */
export const textStrokes = (
  text: string,
  height: number,
  cx: number,
  cy: number,
): [number, number][][] => {
  const unit = height / 6;
  const chars = [...text.toUpperCase()];
  const width = (chars.length * ADVANCE - 1.5) * unit;
  const [left, bottom] = [cx - width / 2, cy - height / 2];
  return chars.flatMap((char, i) =>
    (parsed.get(char) ?? []).map((stroke) =>
      stroke.map(([x, y]): [number, number] => [
        left + (i * ADVANCE + x) * unit,
        bottom + y * unit,
      ]),
    ),
  );
};
