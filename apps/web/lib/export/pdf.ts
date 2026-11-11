/** A4, in PostScript points. */
const A4 = { short: 595.28, long: 841.89 } as const;
/** Page margin, in points: 12.7 mm. */
const MARGIN = 36;

const encoder = new TextEncoder();

/**
 * A one-page PDF holding a JPEG image, centred on an A4 page turned to suit it and scaled to fit inside the margins.
 * The image goes in as it is, with the DCT filter, so nothing needs decoding or compressing here.
 * @param jpeg - JPEG file bytes.
 * @param width - Image width, in pixels.
 * @param height - Image height, in pixels.
 * @param title - Document title, for the PDF's info dictionary.
 * @returns The PDF file's bytes.
 */
export const jpegPdf = (
  jpeg: Uint8Array,
  width: number,
  height: number,
  title = "",
): Uint8Array => {
  const landscape = width > height;
  const [pageW, pageH] = landscape ? [A4.long, A4.short] : [A4.short, A4.long];
  const scale = Math.min((pageW - MARGIN * 2) / width, (pageH - MARGIN * 2) / height);
  const [w, h] = [width * scale, height * scale];
  const [x, y] = [(pageW - w) / 2, (pageH - h) / 2];
  const n = (v: number) => v.toFixed(2);
  const content = `q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(y)} cm /Im0 Do Q`;
  // PDF strings escape backslashes and parentheses; anything outside printable ASCII is dropped.
  const safeTitle = title.replace(/[^\x20-\x7e]/g, "").replace(/[\\()]/g, "\\$&");

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\n`);
    if (stream) {
      push("stream\n");
      push(stream);
      push("\nendstream\n");
    }
    push("endobj\n");
  };

  // The binary comment tells tools the file holds binary data.
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(pageW)} ${n(pageH)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  object(
    4,
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
    jpeg,
  );
  object(5, `<< /Length ${encoder.encode(content).length} >>`, encoder.encode(content));
  object(6, `<< /Title (${safeTitle}) /Producer (Echidna) >>`);

  const xref = length;
  const entries = offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`);
  push(`xref\n0 ${offsets.length}\n0000000000 65535 f \n${entries.join("")}`);
  push(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
};
