#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadHubConfig } from "./hub-config.mjs";

function readSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

async function main() {
  const cfg = loadHubConfig();
  const soulPath = path.join(cfg.hermesHome, "SOUL.md");
  const governance = readSafe(path.join(cfg.rulesRoot, "agent-governance.mdc"));
  const agentOs = readSafe(path.join(cfg.rulesRoot, "agent-os.mdc"));
  const body = `# Hermes SOUL — injected by raghavIDE

You are the primary coding agent for raghavIDE hub. Route all LLM traffic through 9Router at http://127.0.0.1:20128/v1.
Use combo/tsc-unlimited model. Fallback order: Cursor → GitHub Copilot → Antigravity → Codex.

## Agent Governance
${governance.slice(0, 4000)}

## Agent OS (summary)
${agentOs.slice(0, 8000)}
`;
  fs.mkdirSync(path.dirname(soulPath), { recursive: true });
  fs.writeFileSync(soulPath, body, "utf8");
  console.log(JSON.stringify({ soulPath, bytes: body.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
