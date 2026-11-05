import spawn from "cross-spawn";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const [app, ...args] = process.argv.slice(2);
const root = fileURLToPath(new URL("../", import.meta.url));
const { workspaces } = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const workspace = workspaces.find((name) => name.endsWith(`-${app}`));

if (!workspace || !["client", "server"].includes(app)) {
  console.error("Usage: npm|pnpm client|server [ -dev | add <package...> ]");
  process.exit(1);
}

const packageManager = process.env.npm_config_user_agent?.startsWith("pnpm/")
  ? "pnpm"
  : "npm";
let commandArgs;
if (args[0] === "add" && args.length > 1) {
  commandArgs =
    packageManager === "pnpm"
      ? ["--filter", workspace, "add", ...args.slice(1)]
      : ["install", ...args.slice(1), "--workspace", workspace];
} else if (args.length === 0 || (args.length === 1 && args[0] === "-dev")) {
  const script = args[0] === "-dev" ? "dev" : "start";
  commandArgs =
    packageManager === "pnpm"
      ? ["--filter", workspace, "run", script]
      : ["run", script, "--workspace", workspace];
} else {
  console.error(`Usage: ${packageManager} ${app} [ -dev | add <package...> ]`);
  process.exit(1);
}

const child = spawn(packageManager, commandArgs, { cwd: root, stdio: "inherit" });
child.once("error", (error) => {
  console.error(`Unable to run ${packageManager}: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
