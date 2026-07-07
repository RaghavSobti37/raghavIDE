import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const HUB_ROOT = path.resolve(__dirname, "..");

function expandEnv(value) {
  if (typeof value !== "string") return value;
  return value.replace(/%([^%]+)%/g, (_, key) => process.env[key] || `%${key}%`);
}

export function loadHubConfig() {
  const localPath = path.join(HUB_ROOT, "hub.config.json");
  const examplePath = path.join(HUB_ROOT, "hub.config.example.json");
  const raw = fs.existsSync(localPath)
    ? fs.readFileSync(localPath, "utf8")
    : fs.readFileSync(examplePath, "utf8");
  const cfg = JSON.parse(raw);
  const tsc = expandEnv(cfg.tscPlatformRoot);
  return {
    ...cfg,
    tscPlatformRoot: tsc,
    skillsRoot: expandEnv(cfg.skillsRoot || path.join(tsc, ".agents", "skills")),
    rulesRoot: expandEnv(cfg.rulesRoot || path.join(tsc, ".cursor", "rules")),
    hermesHome: expandEnv(cfg.hermesHome || path.join(process.env.LOCALAPPDATA || "", "hermes")),
    nineRouterEnv: expandEnv(cfg.nineRouterEnv || path.join(os.homedir(), ".9router", "ide-hub.env")),
    obsidianVault: expandEnv(cfg.obsidianVault || path.join(HUB_ROOT, "memory", "obsidian")),
    mcpCanonical: expandEnv(cfg.mcpCanonical || path.join(HUB_ROOT, "config", "mcp.servers.json")),
    defaultModel: cfg.defaultModel || "combo/tsc-unlimited",
  };
}
