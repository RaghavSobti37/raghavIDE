import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { HUB_ROOT, loadHubConfig } from "./hub-config.mjs";

const CATALOG_PATH = path.join(HUB_ROOT, "config", "mcp.catalog.json");

function loadServersConfig() {
  const hub = loadHubConfig();
  const serversPath = hub.mcpCanonical || path.join(HUB_ROOT, "config", "mcp.servers.json");
  return JSON.parse(fs.readFileSync(serversPath, "utf8"));
}

function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
}

function resolveEnvPlaceholders(value) {
  if (typeof value === "string") {
    return value
      .replace(/\$\{env:([^}]+)\}/g, (_, k) => process.env[k] ?? "")
      .replace(/\$\{([^}]+)\}/g, (_, k) => process.env[k] ?? "");
  }
  if (Array.isArray(value)) return value.map(resolveEnvPlaceholders);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveEnvPlaceholders(v)]),
    );
  }
  return value;
}

function commandExists(cmd) {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [cmd], { encoding: "utf8", shell: true });
  return result.status === 0;
}

async function checkHttpServer(id, config, catalogEntry) {
  const url = config.url;
  if (!url) return { id, type: "http", status: "error", message: "missing url" };

  const headers = resolveEnvPlaceholders(config.headers || {});
  if (catalogEntry?.authType === "bearer") {
    const missing = (catalogEntry.envVars || []).filter((v) => !process.env[v]);
    if (missing.length) {
      return {
        id,
        type: "http",
        status: "needs_auth",
        message: `missing env: ${missing.join(", ")}`,
        url,
      };
    }
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 || res.status === 403) {
      return { id, type: "http", status: "needs_auth", message: `HTTP ${res.status}`, url };
    }
    if (res.ok || res.status === 404 || res.status === 405) {
      return { id, type: "http", status: "reachable", message: `HTTP ${res.status}`, url };
    }
    return { id, type: "http", status: "warning", message: `HTTP ${res.status}`, url };
  } catch (err) {
    return { id, type: "http", status: "error", message: err.message, url };
  }
}

function checkStdioServer(id, config, catalogEntry) {
  const command = resolveEnvPlaceholders(config.command);
  if (!command) return { id, type: "stdio", status: "error", message: "missing command" };

  const exists =
    fs.existsSync(command) ||
    commandExists(path.basename(command)) ||
    commandExists(command);
  const missingEnv = (catalogEntry?.envVars || []).filter(
    (v) => !process.env[v] && !config.env?.[v],
  );

  if (!exists) {
    return {
      id,
      type: "stdio",
      status: "error",
      message: `command not found: ${command}`,
      command,
    };
  }
  if (missingEnv.length) {
    return {
      id,
      type: "stdio",
      status: "warning",
      message: `command ok; unset env: ${missingEnv.join(", ")}`,
      command,
    };
  }
  return { id, type: "stdio", status: "ok", message: "command available", command };
}

const serversCfg = loadServersConfig();
const catalog = loadCatalog();
const enabled = serversCfg.enabled || Object.keys(serversCfg.mcpServers || {});
const results = [];

for (const id of enabled) {
  const config = serversCfg.mcpServers?.[id];
  const catalogEntry = catalog.servers?.[id];
  if (!config) {
    results.push({ id, status: "error", message: "enabled but not defined in mcpServers" });
    continue;
  }
  if (config.url) results.push(await checkHttpServer(id, config, catalogEntry));
  else if (config.command) results.push(checkStdioServer(id, config, catalogEntry));
  else results.push({ id, status: "error", message: "unknown transport (no url or command)" });
}

const summary = {
  total: results.length,
  ok: results.filter((r) => ["ok", "reachable"].includes(r.status)).length,
  needs_auth: results.filter((r) => r.status === "needs_auth").length,
  warning: results.filter((r) => r.status === "warning").length,
  error: results.filter((r) => r.status === "error").length,
};

console.log(JSON.stringify({ ok: summary.error === 0, summary, servers: results }, null, 2));
