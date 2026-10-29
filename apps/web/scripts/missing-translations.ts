import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { type Messages, missingKeys } from "../i18n/messages";
import { defaultLocale, locales } from "../i18n/routing";

const dir = fileURLToPath(new URL("../messages", import.meta.url));
const strict = process.argv.includes("--strict");

const load = (locale: string): Messages => JSON.parse(readFileSync(join(dir, `${locale}.json`), "utf8"));

const reference = load(defaultLocale);
const results = locales
  .filter((locale) => locale !== defaultLocale)
  .map((locale) => {
    const messages = load(locale);
    return { locale, missing: missingKeys(reference, messages), unused: missingKeys(messages, reference) };
  });

const lines = [
  "## Translations",
  "",
  "| Locale | Missing | Unused |",
  "| --- | --- | --- |",
  ...results.map(({ locale, missing, unused }) => `| ${locale} | ${missing.length} | ${unused.length} |`),
  "",
  ...results.flatMap(({ locale, missing, unused }) => [
    ...(missing.length ? [`**${locale} missing** (falls back to English): ${missing.map((k) => `\`${k}\``).join(", ")}`, ""] : []),
    ...(unused.length ? [`**${locale} unused**: ${unused.map((k) => `\`${k}\``).join(", ")}`, ""] : []),
  ]),
];
const report = lines.join("\n");

console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);

const problems = results.some(({ missing, unused }) => missing.length + unused.length > 0);
if (problems) {
  for (const { locale, missing } of results) {
    for (const key of missing) console.log(`::warning title=Missing translation (${locale})::${key}`);
  }
  if (strict) process.exit(1);
}
