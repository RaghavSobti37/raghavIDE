#!/usr/bin/env node
import { apiRequest, healthCheck } from "./lib.mjs";

const COMBO_NAME = "tsc-unlimited";
const TIER_ORDER = [
  { provider: "cursor", model: "default" },
  { provider: "copilot", model: "default" },
  { provider: "antigravity", model: "default" },
  { provider: "codex", model: "default" },
  { provider: "glm", model: "default" },
  { provider: "minimax", model: "default" },
  { provider: "kimi", model: "default" },
  { provider: "kiro", model: "default" },
  { provider: "opencode", model: "default" },
];

export async function ensureTscCombo() {
  const health = await healthCheck();
  if (!health.ok) throw new Error("9router not healthy");

  const providersRes = await apiRequest("GET", "/api/providers");
  const connected = new Set((providersRes.data?.connections || []).map((c) => c.provider));
  const models = TIER_ORDER.filter((e) => connected.has(e.provider));
  if (models.length === 0) {
    return { ok: false, comboName: COMBO_NAME, modelId: "cu/default", connected: [] };
  }

  const combosRes = await apiRequest("GET", "/api/combos");
  const existing = (combosRes.data?.combos || []).find((c) => c.name === COMBO_NAME);
  const body = { name: COMBO_NAME, strategy: "account-fallback", models };

  if (existing?.id) {
    await apiRequest("PUT", `/api/combos/${existing.id}`, body);
  } else {
    await apiRequest("POST", "/api/combos", body);
  }

  await apiRequest("POST", "/api/settings", { comboStrategies: { [COMBO_NAME]: "account-fallback" } });

  const comboModelId = `combo/${COMBO_NAME}`;
  const modelId = models.length >= 2 ? comboModelId : connected.has("cursor") ? "cu/default" : comboModelId;

  return { ok: true, comboName: COMBO_NAME, modelId, comboModelId, connected: [...connected], modelsInCombo: models };
}

async function main() {
  const result = await ensureTscCombo();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1]?.includes("configure-combos")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
