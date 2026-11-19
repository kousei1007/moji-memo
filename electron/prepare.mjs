// Run after `next build`: completes .next/standalone so it can be shipped inside the desktop app.
// Next leaves static assets out of the standalone folder; the server serves them once copied in.
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("`.next/standalone/server.js` が見つかりません。先に `next build` を実行してください。");
  process.exit(1);
}

cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) {
  cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
}

// Local secrets must never ship inside an installer.
for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  rmSync(path.join(standalone, name), { force: true });
}

console.log("standalone server is ready:", standalone);
