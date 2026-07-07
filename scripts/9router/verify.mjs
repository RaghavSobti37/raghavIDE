#!/usr/bin/env node
import {
  chatSmoke,
  ensureApiKey,
  healthCheck,
  NINEROUTER_BASE_URL,
  getConnectedProviders,
  isSmokeRouted,
  resolveDefaultModel,
} from "./lib.mjs";
import { ensureTscCombo } from "./configure-combos.mjs";

const MIN_PROVIDERS = Number(process.env.NINEROUTER_MIN_PROVIDERS || "1");

async function main() {
  const health = await healthCheck();
  if (!health.ok) {
    console.error("FAIL health", health);
    process.exit(1);
  }

  const connections = await getConnectedProviders();
  const count = connections.length;
  if (count === 0) {
    console.error("FAIL no providers connected");
    process.exit(2);
  }

  const combo = await ensureTscCombo().catch(() => null);
  const model = resolveDefaultModel(connections, combo?.ok ? combo : null);

  const apiKey = await ensureApiKey("ide-hub");
  const smoke = await chatSmoke(apiKey, model);
  const routed = isSmokeRouted(smoke);

  const report = {
    endpoint: NINEROUTER_BASE_URL,
    model,
    providersConnected: count,
    minProviders: MIN_PROVIDERS,
    providers: connections.map((c) => c.provider),
    combo: combo?.comboName || null,
    smoke,
    routed,
    needsMoreProviders: count < MIN_PROVIDERS,
  };

  console.log(JSON.stringify(report, null, 2));

  let code = 0;
  if (!routed) code = 3;
  else if (count < MIN_PROVIDERS) code = 4;

  setTimeout(() => process.exit(code), 50);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
