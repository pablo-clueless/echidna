import { jpegPdf } from "./pdf";

/** Room round the drawing, in pixels. */
const PAD = 24;
/** How much finer than on screen the PDF's image is drawn, so it prints sharply. */
const PDF_SCALE = 3;
const SVG_NS = "http://www.w3.org/2000/svg";

/** Styles the schematic takes from the page's CSS, which a file on its own has to carry inline. */
const STYLES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
] as const;

/** Whether a computed colour paints nothing. */
const invisible = (colour: string) =>
  colour === "none" || colour === "transparent" || /rgba\([^)]*,\s*0\)$/.test(colour);

export type SchematicImage = { svg: string; width: number; height: number };

/**
 * The schematic on screen, as a standalone SVG file: the drawing without the grid, pan or zoom, cropped to the parts
 * and wires with a margin, its colours and fonts copied inline from the page's styles, on the panel's background.
 * Click targets that paint nothing are left out.
 * @param svg - The schematic editor's `<svg>`, whose drawing is in its `[data-schematic-content]` group.
 * @returns The file and its size in pixels, or `null` when there is nothing drawn.
 */
export const schematicSvg = (svg: SVGSVGElement): SchematicImage | null => {
  const content = svg.querySelector<SVGGElement>("[data-schematic-content]");
  if (!content) return null;
  const box = content.getBBox();
  if (box.width === 0 && box.height === 0) return null;

  const copy = content.cloneNode(true) as SVGGElement;
  copy.removeAttribute("transform");
  const originals = [content, ...content.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll("*")];
  const drop: Element[] = [];
  originals.forEach((original, i) => {
    const target = copies[i];
    if (!target) return;
    const computed = getComputedStyle(original);
    for (const name of STYLES) target.setAttribute(name, computed.getPropertyValue(name));
    for (const name of ["class", "role", "tabindex", "aria-label", "aria-pressed"])
      target.removeAttribute(name);
    const shape = !(original instanceof SVGGElement || original instanceof SVGTextContentElement);
    if (shape && invisible(computed.fill) && invisible(computed.stroke)) drop.push(target);
  });
  for (const element of drop) element.remove();

  const [x, y] = [box.x - PAD, box.y - PAD];
  const [width, height] = [Math.ceil(box.width + PAD * 2), Math.ceil(box.height + PAD * 2)];
  const background = getComputedStyle(svg.closest("section") ?? document.body).backgroundColor;

  const out = document.createElementNS(SVG_NS, "svg");
  out.setAttribute("xmlns", SVG_NS);
  out.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  out.setAttribute("width", String(width));
  out.setAttribute("height", String(height));
  const fill = document.createElementNS(SVG_NS, "rect");
  for (const [k, v] of Object.entries({ x, y, width, height, fill: background }))
    fill.setAttribute(k, String(v));
  out.append(fill, copy);
  return {
    svg: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(out)}\n`,
    width,
    height,
  };
};

/**
 * Draws the SVG on a canvas and saves it as a JPEG inside a one-page A4 PDF.
 * @param image - From `schematicSvg`.
 * @param title - Document title.
 * @returns The PDF's bytes.
 */
export const schematicPdf = async (image: SchematicImage, title: string): Promise<Uint8Array> => {
  const url = URL.createObjectURL(new Blob([image.svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width * PDF_SCALE;
    canvas.height = image.height * PDF_SCALE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D canvas");
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) throw new Error("Could not encode the schematic");
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    return jpegPdf(jpeg, canvas.width, canvas.height, title);
  } finally {
    URL.revokeObjectURL(url);
  }
};
