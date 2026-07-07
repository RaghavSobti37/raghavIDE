#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadHubConfig, HUB_ROOT } from "./hub-config.mjs";

function readSafe(p, fallback = "") {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return fallback;
  }
}

function writeNote(vault, name, content) {
  const p = path.join(vault, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  return p;
}

async function main() {
  const cfg = loadHubConfig();
  const vault = cfg.obsidianVault;
  const today = new Date().toISOString().slice(0, 10);

  const hermesMem = readSafe(path.join(cfg.hermesHome, "memories", "MEMORY.md"), "_No Hermes memory yet._\n");
  const hermesUser = readSafe(path.join(cfg.hermesHome, "memories", "USER.md"), "_No user profile yet._\n");
  const hermesSoul = readSafe(path.join(cfg.hermesHome, "SOUL.md"), "_Run npm run hermes:soul_\n");

  let mcpStatus = "{}";
  const verifyMcp = path.join(HUB_ROOT, "scripts", "verify-mcp.mjs");
  if (fs.existsSync(verifyMcp)) {
    const r = spawnSync("node", [verifyMcp], { encoding: "utf8", cwd: HUB_ROOT });
    mcpStatus = r.stdout || r.stderr || "{}";
  }

  let skillsIndex = "_Manifest not found._";
  const manifestPath = path.join(cfg.tscPlatformRoot, ".agents", "skills-manifest.json");
  if (fs.existsSync(manifestPath)) {
    const m = JSON.parse(readSafe(manifestPath, "{}"));
    skillsIndex = `# SkillsIndex\n\nCount: ${m.skillCount || 0}\nUpdated: ${m.updatedAt || "?"}\n\nCanonical: \`.agents/skills\`\n`;
  }

  writeNote(vault, "HermesMemory.md", `# Hermes Memory\n\n${hermesMem}`);
  writeNote(vault, "HermesUser.md", `# Hermes User\n\n${hermesUser}`);
  writeNote(vault, "HermesSoul.md", `# Hermes SOUL\n\n${hermesSoul}`);
  writeNote(vault, "MCPIndex.md", `# MCP Connections\n\n\`\`\`json\n${mcpStatus}\n\`\`\`\n`);
  writeNote(vault, "SkillsIndex.md", skillsIndex);
  writeNote(
    vault,
    "IDEHub.md",
    `# IDEHub\n\n| Setting | Value |\n|---------|-------|\n| 9Router | http://127.0.0.1:20128/v1 |\n| Model | ${cfg.defaultModel} |\n| Hub | ${HUB_ROOT} |\n`,
  );
  writeNote(
    vault,
    "INDEX.md",
    `# raghavIDE Obsidian Index\n\n> Last updated: ${today}\n\n- [[IDEHub]]\n- [[MCPIndex]]\n- [[SkillsIndex]]\n- [[HermesMemory]]\n- [[HermesUser]]\n- [[HermesSoul]]\n- [[SessionLog]]\n`,
  );

  if (!fs.existsSync(path.join(vault, "SessionLog.md"))) {
    writeNote(vault, "SessionLog.md", "# SessionLog\n\n_Append-only agent session summaries._\n");
  }

  console.log(JSON.stringify({ vault, updated: today }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
