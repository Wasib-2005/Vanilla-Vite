import spawn from "cross-spawn";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const project = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const packageManager = process.env.npm_config_user_agent?.startsWith("pnpm/")
  ? "pnpm"
  : "npm";
const apps = project.workspaces.map((workspace) => ({
  name: workspace.endsWith("-client") ? "client" : "server",
  workspace,
}));
const colors = { client: 36, server: 35, dev: 90 };
const children = [];
let stopping = false;
let restarting = false;

function log(name, message, write = console.log) {
  const prefix = `[${name}]`;
  write(
    `${process.env.NO_COLOR === undefined && process.stdout.isTTY ? `\x1b[${colors[name]}m${prefix}\x1b[0m` : prefix} ${message}`,
  );
}

function start({ name, workspace }) {
  const args =
    packageManager === "pnpm"
      ? ["--filter", workspace, "run", "dev"]
      : ["run", "dev", "--workspace", workspace];
  const child = spawn(packageManager, args, {
    cwd: root,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/).filter(Boolean)) log(name, line);
    });
  }
  child.once("error", (error) => {
    log(name, `Unable to start: ${error.message}`, console.error);
    process.exitCode = 1;
    void stop();
  });
  child.once("close", (code) => {
    if (!stopping && !restarting) {
      process.exitCode = code ?? 1;
      void stop();
    }
  });
}

function signalChild(child, signal) {
  try {
    if (process.platform !== "win32" && child.pid) {
      process.kill(-child.pid, signal);
    } else if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function waitForClose(child, timeout) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off("close", onClose);
      resolve();
    }, timeout);
    const onClose = () => {
      clearTimeout(timer);
      resolve();
    };
    child.once("close", onClose);
  });
}

async function stopChildren() {
  const running = [...children];
  for (const child of running) signalChild(child, "SIGINT");
  await Promise.all(running.map((child) => waitForClose(child, 3000)));
  for (const child of running) signalChild(child, "SIGTERM");
  await Promise.all(running.map((child) => waitForClose(child, 1000)));
  for (const child of running) signalChild(child, "SIGKILL");
  await Promise.all(running.map((child) => waitForClose(child, 1000)));
  children.length = 0;
}

async function stop() {
  if (stopping) return;
  stopping = true;
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  await stopChildren();
}

async function restart() {
  if (restarting || stopping) return;
  restarting = true;
  log("dev", "Restarting application processes...");
  await stopChildren();
  if (stopping) return;
  restarting = false;
  for (const app of apps) start(app);
  log("dev", "Application processes restarted.");
}

for (const app of apps) start(app);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => void stop());
}

if (process.stdin.isTTY) {
  console.log("Shortcuts: r = restart, c = clear terminal, Ctrl+C = stop.");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (key) => {
    if (key.includes("\u0003")) void stop();
    else if (key.toString().toLowerCase() === "r") void restart();
    else if (key.toString().toLowerCase() === "c") {
      process.stdout.write("\x1b[2J\x1b[H");
      console.log("Shortcuts: r = restart, c = clear terminal, Ctrl+C = stop.");
    }
  });
}
