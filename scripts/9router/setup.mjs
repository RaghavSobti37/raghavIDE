#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  NINEROUTER_BASE_URL,
  NINEROUTER_DASHBOARD_URL,
  apiRequest,
  chatSmoke,
  ensureApiKey,
  healthCheck,
  getConnectedProviders,
  isSmokeRouted,
  resolveDefaultModel,
  readJsonIfExists,
  writeJson,
  writeLocalEnv,
} from "./lib.mjs";
import { ensureTscCombo } from "./configure-combos.mjs";

const home = os.homedir();
const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
const antigravityLocal = path.join(localAppData, "Programs", "Antigravity");

const paths = {
  cursorSettings: path.join(appData, "Cursor", "User", "settings.json"),
  vscodeSettings: path.join(appData, "Code", "User", "settings.json"),
  windsurfSettings: path.join(appData, "Windsurf", "User", "settings.json"),
  antigravitySettings: path.join(appData, "Antigravity", "User", "settings.json"),
  zedSettings: path.join(appData, "Zed", "settings.json"),
  continueConfig: path.join(home, ".continue", "config.json"),
};

function mergeSettings(filePath, patch) {
  const current = readJsonIfExists(filePath) || {};
  writeJson(filePath, { ...current, ...patch });
  return filePath;
}

function patchContinue(apiKey, model) {
  const cfg = readJsonIfExists(paths.continueConfig) || { models: [] };
  const models = Array.isArray(cfg.models) ? cfg.models.filter((m) => m.title !== "9Router") : [];
  models.unshift({ title: "9Router", provider: "openai", model, apiBase: NINEROUTER_BASE_URL, apiKey });
  writeJson(paths.continueConfig, { ...cfg, models });
  return paths.continueConfig;
}

function patchClineSettings(filePath, apiKey, model) {
  return mergeSettings(filePath, {
    "cline.apiProvider": "openai-compatible",
    "cline.openAiBaseUrl": NINEROUTER_BASE_URL,
    "cline.openAiApiKey": apiKey,
    "cline.modelId": model,
    "roo-cline.apiProvider": "openai-compatible",
    "roo-cline.openAiBaseUrl": NINEROUTER_BASE_URL,
    "roo-cline.openAiApiKey": apiKey,
    "roo-cline.modelId": model,
  });
}

function patchOpenAiIde(filePath, apiKey, model) {
  if (!fs.existsSync(path.dirname(filePath))) return null;
  return mergeSettings(filePath, {
    "openai.baseUrl": NINEROUTER_BASE_URL,
    "openai.apiKey": apiKey,
    "openai.model": model,
  });
}

async function applyCliTool(tool, body) {
  return apiRequest("POST", `/api/cli-tools/${tool}-settings`, body);
}

async function configureCliTools(apiKey, model) {
  const results = [];
  const endpoint = NINEROUTER_BASE_URL;
  const claudeEnv = {
    ANTHROPIC_BASE_URL: endpoint,
    ANTHROPIC_AUTH_TOKEN: apiKey,
    API_TIMEOUT_MS: "600000",
  };
  results.push({ tool: "claude", ...(await applyCliTool("claude", { env: claudeEnv })) });
  const simple = { baseUrl: endpoint, apiKey, model };
  for (const tool of ["codex", "droid", "openclaw", "opencode", "hermes"]) {
    const status = await apiRequest("GET", `/api/cli-tools/${tool}-settings`);
    if (!status.success || status.data?.installed === false) {
      results.push({ tool, skipped: "not installed" });
      continue;
    }
    results.push({ tool, ...(await applyCliTool(tool, simple)) });
  }
  return results;
}

async function importCursorProvider() {
  const found = await apiRequest("GET", "/api/oauth/cursor/auto-import");
  if (!found.success || !found.data?.found) return { imported: false };
  const imported = await apiRequest("POST", "/api/oauth/cursor/import", {
    accessToken: found.data.accessToken,
    machineId: found.data.machineId,
  });
  return { imported: imported.success, connection: imported.data?.connection || null };
}

function ensureWindowsAutostart() {
  const startupDir = path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  try {
    fs.mkdirSync(startupDir, { recursive: true });
    const shortcutPath = path.join(startupDir, "9router-tray.cmd");
    fs.writeFileSync(shortcutPath, '@echo off\r\nstart "" /min 9router -t -n\r\n', "utf8");
    return { path: shortcutPath, status: "created" };
  } catch (err) {
    return { status: "failed", detail: String(err.message || err) };
  }
}

async function main() {
  const health = await healthCheck();
  if (!health.ok) {
    console.error("9router not healthy. Start with: 9router -t -n");
    process.exit(1);
  }

  const apiKey = await ensureApiKey("ide-hub");
  const cursorImport = await importCursorProvider();
  const connections = await getConnectedProviders();
  const connectionCount = connections.length;
  const comboResult = await ensureTscCombo().catch((err) => ({ ok: false, error: String(err.message || err) }));
  const model = resolveDefaultModel(connections, comboResult.ok ? comboResult : null);
  const envPath = writeLocalEnv({ apiKey, model });

  const patches = [];
  for (const idePath of [paths.cursorSettings, paths.vscodeSettings, paths.windsurfSettings, paths.antigravitySettings]) {
    const patched = patchOpenAiIde(idePath, apiKey, model);
    if (patched) patches.push(patched);
  }
  for (const idePath of [paths.vscodeSettings, paths.cursorSettings, paths.windsurfSettings, paths.antigravitySettings]) {
    if (fs.existsSync(path.dirname(idePath))) patchClineSettings(idePath, apiKey, model);
  }
  if (fs.existsSync(path.dirname(paths.continueConfig)) || fs.mkdirSync(path.dirname(paths.continueConfig), { recursive: true }) === undefined) {
    patches.push(patchContinue(apiKey, model));
  }

  const cliResults = await configureCliTools(apiKey, model);
  const autostart = process.platform === "win32" ? ensureWindowsAutostart() : { status: "skipped" };
  const smoke = connectionCount > 0 ? await chatSmoke(apiKey, model) : { ok: false, skipped: true };
  const smokeRouted = isSmokeRouted(smoke);

  const report = {
    ok: true,
    dashboard: NINEROUTER_DASHBOARD_URL,
    endpoint: NINEROUTER_BASE_URL,
    envFile: envPath,
    model,
    combo: comboResult,
    cursorImport,
    providersConnected: connectionCount,
    providerHints: {
      copilot: `${NINEROUTER_DASHBOARD_URL.replace("/dashboard", "")}/dashboard/providers`,
      antigravity: antigravityLocal,
    },
    patchedFiles: patches,
    cliTools: cliResults,
    autostart,
    smoke,
    smokeRouted,
    needsMoreProviders: connectionCount < 2,
    copilotNote: "Connect GitHub Copilot OAuth in dashboard. Cline/Continue use 9Router.",
    antigravityNote: "Connect Antigravity in dashboard for ag/* fallback.",
  };

  console.log(JSON.stringify(report, null, 2));
  if (connectionCount === 0) process.exit(2);
  if (!smokeRouted) process.exit(3);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
