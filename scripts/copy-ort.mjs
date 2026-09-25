// Copies onnxruntime-web's wasm runtime into public/ort/ so the static export
// serves it locally instead of fetching from a CDN.
import { mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, "..", "node_modules", "onnxruntime-web", "dist");
const destDir = join(__dirname, "..", "public", "ort");

mkdirSync(destDir, { recursive: true });

const files = readdirSync(srcDir).filter((f) => f.endsWith(".wasm") || f.endsWith(".mjs"));
for (const file of files) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}

console.log(`copy-ort: copied ${files.length} files to public/ort/`);
