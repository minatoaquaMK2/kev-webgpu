import { defineConfig } from "vitest/config";
import { execSync } from "node:child_process";
let revision = "uncommitted";
try {
  revision = execSync("git rev-parse HEAD", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (execSync("git status --porcelain", { encoding: "utf8" }).trim())
    revision += "-dirty";
} catch {}
export default defineConfig({
  base: process.env.PAGES_BASE || "/",
  define: {
    __APP_REVISION__: JSON.stringify(process.env.APP_REVISION || revision),
  },
  worker: { format: "es" },
  build: { target: "es2022", rollupOptions: { input: { guide: "index.html", demo: "demo/index.html" } } },
  test: { include: ["tests/**/*.test.ts"] },
});
