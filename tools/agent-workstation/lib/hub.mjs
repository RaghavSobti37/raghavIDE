import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(__dirname, '..', '..', '..');
const HUB_CONFIG_PATH = path.join(HUB_ROOT, 'hub.config.json');

let cachedConfig;

export function hubRoot() {
  return HUB_ROOT;
}

export async function loadHubConfig() {
  if (cachedConfig) return cachedConfig;
  const raw = await fs.readFile(HUB_CONFIG_PATH, 'utf8');
  cachedConfig = JSON.parse(raw);
  return cachedConfig;
}

export function skillsManifestPath(config) {
  return path.join(path.dirname(config.skillsRoot), 'skills-manifest.json');
}

export function verifyMcpScriptPath() {
  return path.join(HUB_ROOT, 'scripts', 'verify-mcp.mjs');
}
