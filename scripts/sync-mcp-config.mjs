import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HUB_ROOT, loadHubConfig } from "./hub-config.mjs";

const dryRun = process.argv.includes("--dry-run");

function loadServersConfig() {
  const hub = loadHubConfig();
  const serversPath = hub.mcpCanonical || path.join(HUB_ROOT, "config", "mcp.servers.json");
  const raw = JSON.parse(fs.readFileSync(serversPath, "utf8"));
  const enabled = raw.enabled || Object.keys(raw.mcpServers || {});
  const mcpServers = {};
  for (const id of enabled) {
    if (raw.mcpServers?.[id]) mcpServers[id] = raw.mcpServers[id];
  }
  return { enabled, mcpServers, serversPath };
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeMcpJson(targetPath, mcpServers) {
  const content = `${JSON.stringify({ mcpServers }, null, 2)}\n`;
  if (dryRun) return { path: targetPath, action: "dry-run", bytes: content.length };
  ensureDir(targetPath);
  fs.writeFileSync(targetPath, content, "utf8");
  return { path: targetPath, action: "written", bytes: content.length };
}

const hub = loadHubConfig();
const { enabled, mcpServers, serversPath } = loadServersConfig();
const targets = [
  path.join(os.homedir(), ".cursor", "mcp.json"),
  path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "Code",
    "User",
    "mcp.json",
  ),
];
if (hub.tscPlatformRoot && fs.existsSync(hub.tscPlatformRoot)) {
  targets.push(path.join(hub.tscPlatformRoot, ".cursor", "mcp.json"));
}
const results = targets.map((t) => writeMcpJson(t, mcpServers));
console.log(
  JSON.stringify(
    {
      ok: true,
      dryRun,
      source: serversPath,
      enabled,
      serverCount: Object.keys(mcpServers).length,
      targets: results,
    },
    null,
    2,
  ),
);
