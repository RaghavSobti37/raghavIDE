import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HUB_ROOT } from "./hub-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(HUB_ROOT, "config", "mcp.catalog.json");
const PLUGINS_ROOT = path.join(os.homedir(), ".cursor", "plugins", "cache");

const PLUGIN_ID_MAP = {
  "bright-data": "bright-data",
  browse: "browse",
  browserstack: "browserstack",
  clerk: "clerk",
  mongodb: "mongodb",
  "neon-postgres": "neon-postgres",
  posthog: "posthog",
  prisma: "prisma",
  render: "render",
  resend: "resend",
  sentry: "sentry",
  supabase: "supabase",
  vercel: "vercel",
};

function walkMcpJsonFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMcpJsonFiles(full, results);
    } else if (entry.name === "mcp.json") {
      results.push(full);
    }
  }
  return results;
}

function pluginNameFromPath(mcpPath) {
  const parts = mcpPath.split(path.sep);
  const cacheIdx = parts.indexOf("cache");
  if (cacheIdx >= 0 && parts[cacheIdx + 2]) {
    return parts[cacheIdx + 2];
  }
  return null;
}

function toPattern(mcpPath) {
  const rel = path.relative(PLUGINS_ROOT, mcpPath);
  const segments = rel.split(path.sep);
  if (segments.length < 2) return null;
  const plugin = segments[0] === "cursor-public" ? segments[1] : segments[0];
  return path.join(
    os.homedir(),
    ".cursor",
    "plugins",
    "cache",
    "cursor-public",
    plugin,
    "**",
    "mcp.json",
  );
}

function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
}

function discover() {
  const catalog = loadCatalog();
  const found = walkMcpJsonFiles(PLUGINS_ROOT);
  const byPlugin = new Map();

  for (const mcpPath of found) {
    const plugin = pluginNameFromPath(mcpPath);
    if (!plugin) continue;
    const catalogId = PLUGIN_ID_MAP[plugin] || plugin;
    if (!byPlugin.has(catalogId)) {
      byPlugin.set(catalogId, { plugin, mcpPath, pattern: toPattern(mcpPath) });
    }
  }

  const updates = [];
  for (const [id, info] of byPlugin) {
    if (!catalog.servers[id]) continue;
    const prev = catalog.servers[id].cursorPluginPath;
    catalog.servers[id].cursorPluginPath = info.pattern;
    catalog.servers[id].discoveredMcpPath = info.mcpPath;
    updates.push({ id, plugin: info.plugin, mcpPath: info.mcpPath, previous: prev });
  }

  return { catalog, updates, scanned: found.length };
}

const write = process.argv.includes("--write");
const { catalog, updates, scanned } = discover();

if (write) {
  fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      write,
      scanned,
      updated: updates.length,
      updates,
    },
    null,
    2,
  ),
);
