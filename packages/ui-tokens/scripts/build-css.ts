import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { toCss } from "../src/css";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/tokens.css");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, toCss());
console.log(`Wrote ${out}`);
