#!/usr/bin/env node
/**
 * Install Hermes Agent (Windows native) if missing.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadHubConfig } from "./hub-config.mjs";

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", shell: true, ...opts });
}

function hermesInstalled() {
  const which = run("where", ["hermes"]);
  if (which.status === 0 && which.stdout.trim()) return true;
  const cfg = loadHubConfig();
  return fs.existsSync(path.join(cfg.hermesHome, "config.yaml"));
}

async function main() {
  if (hermesInstalled()) {
    const doctor = run("hermes", ["doctor"]);
    console.log(JSON.stringify({ installed: true, doctor: doctor.stdout || doctor.stderr }, null, 2));
    process.exit(doctor.status === 0 ? 0 : 1);
  }

  console.log("Installing Hermes Agent (this may take several minutes)...");
  const install = run(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "iex (irm https://hermes-agent.nousresearch.com/install.ps1)"],
    { timeout: 600000 },
  );

  console.log(install.stdout);
  if (install.stderr) console.error(install.stderr);

  const ok = hermesInstalled();
  console.log(JSON.stringify({ installed: ok, exitCode: install.status }, null, 2));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
