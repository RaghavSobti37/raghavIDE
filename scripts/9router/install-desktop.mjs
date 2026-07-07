#!/usr/bin/env node
/**
 * Install/update 9router desktop (npm global + tray + shortcuts).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { healthCheck, NINEROUTER_DASHBOARD_URL } from "./lib.mjs";

const home = os.homedir();
const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", shell: true, ...opts });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function ensureGlobalInstall() {
  const before = run("npm", ["list", "-g", "9router", "--depth=0"]);
  const install = run("npm", ["install", "-g", "9router@latest", "--prefer-online"], {
    timeout: 120000,
  });
  const after = run("npm", ["list", "-g", "9router", "--depth=0"]);
  const version = (after.stdout.match(/9router@([\d.]+)/) || [])[1] || null;
  const busyLocked =
    /EBUSY|resource busy|locked/i.test(install.stderr || "") && Boolean(version);
  return {
    before: before.stdout,
    installOk: install.ok || busyLocked,
    version,
    skippedUpdate: busyLocked ? "tray running — stop 9router to npm update" : null,
    stderr: install.ok ? "" : install.stderr,
  };
}

function createDesktopShortcut() {
  const desktop = path.join(home, "Desktop");
  const batPath = path.join(desktop, "9Router.bat");
  const body = "@echo off\r\nstart \"\" /min 9router -t -n\r\nstart \"\" " + NINEROUTER_DASHBOARD_URL + "\r\n";
  try {
    fs.writeFileSync(batPath, body, "utf8");
    return { path: batPath, status: "created" };
  } catch (err) {
    return { status: "failed", detail: String(err.message || err) };
  }
}

function ensureTrayRunning() {
  const start = run("9router", ["-t", "-n"], { timeout: 8000 });
  return { started: start.ok, stderr: start.stderr };
}

async function main() {
  const globalInstall = ensureGlobalInstall();
  const shortcut = createDesktopShortcut();
  const tray = ensureTrayRunning();

  await new Promise((r) => setTimeout(r, 2000));
  const health = await healthCheck();

  const report = {
    globalInstall,
    shortcut,
    tray,
    health,
    dashboard: NINEROUTER_DASHBOARD_URL,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(health.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
