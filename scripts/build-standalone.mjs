import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const sourceDir = path.join(rootDir, "flashcards");
const distDir = path.join(rootDir, "dist");

const [html, css, cards, app] = await Promise.all([
  readFile(path.join(sourceDir, "index.html"), "utf8"),
  readFile(path.join(sourceDir, "styles.css"), "utf8"),
  readFile(path.join(sourceDir, "cards.js"), "utf8"),
  readFile(path.join(sourceDir, "app.js"), "utf8")
]);

let standaloneHtml = html
  .replace(/<link rel="manifest" href="\.\/manifest\.webmanifest">\n/, "")
  .replace(/<link rel="stylesheet" href="\.\/styles\.css">/, `<style>\n${css}\n</style>`)
  .replace(/<script src="\.\/cards\.js"><\/script>\n  <script src="\.\/app\.js"><\/script>/, `<script>\n${cards}\n</script>\n  <script>\n${app}\n</script>`);

standaloneHtml = standaloneHtml.replace(
  "<span class=\"status-chip\" id=\"offline-status\">Offline cache unavailable</span>",
  "<span class=\"status-chip\" id=\"offline-status\">Standalone file mode</span>"
);

await mkdir(distDir, { recursive: true });
await writeFile(path.join(distDir, "flashcards.html"), standaloneHtml);

console.log("Built dist/flashcards.html");
