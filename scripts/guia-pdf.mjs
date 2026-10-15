// Genera docs/guia-ocata-vent.pdf (A4) a partir de docs/guia.html. Ho fa l'acció «Documentació» (docs.yml).
// Local: npm i --no-save playwright && npx playwright install chromium && node scripts/guia-pdf.mjs
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const src = resolve("docs/guia.html"), out = process.argv[2] || "guia-ocata-vent.pdf";
const vers = process.env.GUIA_VERSIO || "";
const foot = `<div style="font:7.5pt Helvetica,Arial,sans-serif;color:#6a7a90;width:100%;padding:0 15mm;display:flex;justify-content:space-between">
  <span>Guia d'Ocata Vent${vers ? " · " + vers : ""}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });   // CHROME_PATH: Chromium propi (opcional)
const page = await browser.newPage();
await page.goto(pathToFileURL(src).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true,
  displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: foot });
await browser.close();
console.log("PDF:", out);
