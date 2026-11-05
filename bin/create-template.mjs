#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import spawn from "cross-spawn";
import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const useDefaultStructure = args.includes("--default");
let projectName = args.find((arg) => !arg.startsWith("--"));
const validProjectName = (name) => /^[a-z0-9][a-z0-9_-]*$/.test(name);

if (!projectName && stdin.isTTY) {
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    do {
      projectName = (await prompt.question("Project name: ")).trim();
      if (!validProjectName(projectName)) {
        console.error("Use lowercase letters, numbers, hyphens, or underscores.");
      }
    } while (!validProjectName(projectName));
  } finally {
    prompt.close();
  }
}

if (!projectName || !validProjectName(projectName)) {
  console.error("Usage: create-vanilla-vite <lowercase-project-name>");
  if (!projectName && !stdin.isTTY) {
    console.error("Run this command in an interactive terminal to be prompted for a name.");
  }
  process.exit(1);
}

const packageManager = process.env.npm_config_user_agent?.startsWith("pnpm/")
  ? "pnpm"
  : "npm";
const root = resolve(process.cwd(), projectName);
const clientFolder = `${projectName}-client`;
const serverFolder = `${projectName}-server`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const scriptRoot = fileURLToPath(new URL("../scripts/", import.meta.url));
const cliPackage = JSON.parse(
  await readFile(join(packageRoot, "package.json"), "utf8"),
);

async function updateIfOutdated() {
  const { version: installedVersion } = cliPackage;
  const registry = (process.env.npm_config_registry || "https://registry.npmjs.org")
    .replace(/\/$/, "");

  let latestVersion;
  try {
    const response = await fetch(`${registry}/create-vanilla-vite/latest`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`registry returned HTTP ${response.status}`);
    latestVersion = (await response.json()).version;
    if (typeof latestVersion !== "string") {
      throw new Error("registry response did not include a version");
    }
  } catch (error) {
    console.warn(`\nCould not check for CLI updates: ${error.message}`);
    return;
  }

  if (installedVersion === latestVersion) return;
  if (!stdin.isTTY) {
    console.warn(
      `\nA newer version of create-vanilla-vite is available (${latestVersion}; current: ${installedVersion}). Run ${packageManager} create vanilla-vite@latest to use it.`,
    );
    return;
  }

  console.warn(
    `\nA newer version of create-vanilla-vite is available (${latestVersion}; current: ${installedVersion}).`,
  );
  const useLatest = await selectOption("Which version would you like to use?", [
    { label: `Use the latest version (${latestVersion})`, value: true },
    { label: `Continue with the current version (${installedVersion})`, value: false },
  ]);
  if (!useLatest) return;

  const updateArgs =
    packageManager === "pnpm"
      ? ["dlx", "create-vanilla-vite@latest", ...args]
      : [
          "exec",
          "--yes",
          "--package=create-vanilla-vite@latest",
          "--",
          "create-vanilla-vite",
          ...args,
        ];
  try {
    await run(packageManager, updateArgs, process.cwd());
  } catch (error) {
    console.error(`Unable to start the latest CLI version: ${error.message}`);
    process.exit(1);
  }
  process.exit(0);
}

function run(command, commandArgs, cwd) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, commandArgs, { cwd, stdio: "inherit" });
    child.once("error", rejectRun);
    child.once("close", (code, signal) => {
      if (code === 0) resolveRun();
      else {
        rejectRun(
          new Error(`${command} exited ${signal ? `from ${signal}` : `with code ${code}`}`),
        );
      }
    });
  });
}

async function selectOption(question, options, defaultIndex = 0) {
  if (!stdin.isTTY) return options[defaultIndex].value;
  let selected = defaultIndex;
  emitKeypressEvents(stdin);

  return new Promise((resolveSelection) => {
    function render() {
      stdout.write(`\r\x1b[2K${question}\n`);
      for (const [index, option] of options.entries()) {
        stdout.write(`  ${index === selected ? "❯" : " "} ${option.label}\n`);
      }
      stdout.write("  Use ↑/↓ to select, Enter to confirm, or Esc to keep the default.\n");
      stdout.write(`\x1b[${options.length + 2}A`);
    }

    function finish(value) {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write(`\x1b[${options.length + 2}B\n`);
      resolveSelection(value);
    }

    function onKeypress(_input, key) {
      if (key?.name === "up" || key?.name === "down") {
        selected =
          (selected + (key.name === "down" ? 1 : options.length - 1)) %
          options.length;
        render();
      } else if (key?.name === "return") finish(options[selected].value);
      else if (key?.name === "escape" || (key?.ctrl && key.name === "c")) {
        finish(options[defaultIndex].value);
      }
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("keypress", onKeypress);
    render();
  });
}

async function copyScript(name) {
  const source = await readFile(join(scriptRoot, name), "utf8");
  await writeFile(join(root, "scripts", name), source);
}

function backendFiles(language, framework) {
  const extension = language;
  const typeAnnotation = language === "ts" ? ": number" : "";
  const request = language === "ts"
    ? framework === "express"
      ? "request: import('express').Request"
      : "request: import('node:http').IncomingMessage"
    : "request";
  const response = language === "ts"
    ? framework === "express"
      ? "response: import('express').Response"
      : "response: import('node:http').ServerResponse"
    : "response";
  const app =
    framework === "express"
      ? `import express from "express";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.get("/", (_request, response) => response.json({ message: "Backend is running" }));
  app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
  return app;
}
`
      : `import { createServer } from "node:http";

export function createApp() {
  return createServer((${request}, ${response}) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "Backend is running" }));
  });
}
`;
  const server = `${framework === "express" ? 'import "dotenv/config";\n' : ""}import { createApp } from "./app.${extension}";

const port${typeAnnotation} = Number(process.env.PORT ?? 4000);
const app = createApp();
app.listen(port, () => {
  console.log(\`Backend listening at http://localhost:\${port}\`);
});
`;
  return { app, server };
}

async function createBackend(serverRoot) {
  const language = await selectOption("Select a language for the backend:", [
    { label: "JavaScript", value: "js" },
    { label: "TypeScript", value: "ts" },
  ]);
  const framework = await selectOption("Select a backend framework:", [
    { label: "Basic Node.js — no additional framework", value: "basic" },
    { label: "Express — install Express and dotenv", value: "express" },
  ]);
  const structure = useDefaultStructure
    ? "simple"
    : await selectOption("Select a backend folder structure:", [
        { label: "Simple — standard folders (default)", value: "simple" },
        { label: "Module-based — organized by feature", value: "module" },
      ]);
  const typed = language === "ts";
  let { app, server } = backendFiles(language, framework);
  const sourceRoot = join(serverRoot, "src");
  const folders =
    structure === "simple"
      ? ["routes", "controllers", "middleware", "config"]
      : ["module", "config", "middleware", "utils"];
  for (const folder of folders) {
    await mkdir(join(sourceRoot, folder), { recursive: true });
  }
  if (structure === "module") {
    const request = typed
      ? framework === "express"
        ? "request: import('express').Request"
        : "request: import('node:http').IncomingMessage"
      : "request";
    const response = typed
      ? framework === "express"
        ? "response: import('express').Response"
        : "response: import('node:http').ServerResponse"
      : "response";
    const router =
      framework === "express"
        ? `import { Router } from "express";

export const mainRouter = Router();
mainRouter.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});
`
        : `export function handleRequest(${request}, ${response}) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ message: "Backend is running" }));
}
`;
    await writeFile(join(sourceRoot, `mainRouter.${language}`), router);
    app =
      framework === "express"
        ? `import express from "express";
import { mainRouter } from "./mainRouter.${language}";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(mainRouter);
  return app;
}
`
        : `import { createServer } from "node:http";
import { handleRequest } from "./mainRouter.${language}";

export function createApp() {
  return createServer(handleRequest);
}
`;
  }
  await writeFile(join(sourceRoot, `app.${language}`), app);
  await writeFile(join(sourceRoot, `server.${language}`), server);

  const scripts = typed
    ? { dev: `tsx watch src/server.${language}`, start: `tsx src/server.${language}` }
    : { dev: `node --watch src/server.${language}`, start: `node src/server.${language}` };
  const dependencies = framework === "express" ? { express: "^5", dotenv: "^16" } : {};
  const packageJson = {
    name: serverFolder,
    version: "1.0.0",
    private: true,
    type: "module",
    scripts,
    ...(typed
      ? {
          dependencies: { ...dependencies, tsx: "^4" },
          devDependencies: {
            ...(framework === "express" ? { "@types/express": "^5" } : {}),
            "@types/node": "^22",
            typescript: "^5",
          },
        }
      : Object.keys(dependencies).length
        ? { dependencies }
        : {}),
  };
  await writeFile(join(serverRoot, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  if (typed) {
    await writeFile(
      join(serverRoot, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            noEmit: true,
            allowImportingTsExtensions: true,
          },
          include: ["**/*.ts"],
        },
        null,
        2,
      )}\n`,
    );
  }
  await writeFile(
    join(serverRoot, ".env"),
    "# Local backend environment variables\nPORT=4000\n",
    { flag: "wx" },
  );
}

await updateIfOutdated();

try {
  await mkdir(root);
} catch (error) {
  if (error.code === "EEXIST") console.error(`The destination already exists: ${root}`);
  else console.error(`Unable to create project directory: ${error.message}`);
  process.exit(1);
}

try {
  console.log(`\nCreating the frontend in ${clientFolder} with create-vite...\n`);
  const viteArgs =
    packageManager === "pnpm"
      ? ["create", "vite@latest", clientFolder, "--no-immediate"]
      : ["create", "vite@latest", "--", clientFolder, "--no-immediate"];
  await run(packageManager, viteArgs, root);

  const clientRoot = join(root, clientFolder);
  await Promise.all(
    [".git", "node_modules", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"].map(
      (entry) => rm(join(clientRoot, entry), { recursive: true, force: true }),
    ),
  );
  const clientPackagePath = join(clientRoot, "package.json");
  const clientPackage = JSON.parse(await readFile(clientPackagePath, "utf8"));
  clientPackage.scripts ??= {};
  clientPackage.scripts.start ??= clientPackage.scripts.dev;
  await writeFile(clientPackagePath, `${JSON.stringify(clientPackage, null, 2)}\n`);
  await writeFile(
    join(clientRoot, ".env.local"),
    "# Local frontend environment variables\nVITE_API_URL=http://localhost:4000\n",
    { flag: "wx" },
  );

  const includeServer = await selectOption(
    "Would you like to add a separate backend server?",
    [
      { label: "Yes — include a backend workspace", value: true },
      { label: "No — create a frontend-only project (default)", value: false },
    ],
    1,
  );
  const workspaces = [clientFolder];
  if (includeServer) {
    await createBackend(join(root, serverFolder));
    workspaces.push(serverFolder);
  }

  await mkdir(join(root, "scripts"), { recursive: true });
  await Promise.all(["dev.mjs", "run-app.mjs", "install-info.mjs"].map(copyScript));
  const rootPackage = {
    name: projectName,
    version: "1.0.0",
    private: true,
    workspaces,
    scripts: {
      preinstall: "node scripts/install-info.mjs",
      dev: "node scripts/dev.mjs",
      client: "node scripts/run-app.mjs client",
      ...(includeServer ? { server: "node scripts/run-app.mjs server" } : {}),
    },
    type: "module",
    dependencies: {
      "cross-spawn": cliPackage.dependencies["cross-spawn"],
    },
  };
  await writeFile(join(root, "package.json"), `${JSON.stringify(rootPackage, null, 2)}\n`);
  await writeFile(
    join(root, "pnpm-workspace.yaml"),
    [
      "packages:",
      ...workspaces.map((workspace) => `  - ${workspace}`),
      "",
      "allowBuilds:",
      "  esbuild: true",
      "  sharp: false",
      "  unrs-resolver: false",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(root, ".gitignore"),
    [
      "# Dependencies",
      "node_modules/",
      "",
      "# Build output",
      "**/dist/",
      "**/coverage/",
      "",
      "# Local environment files",
      "**/.env*",
      "!**/.env.example",
      "",
      "# Logs",
      "npm-debug.log*",
      "pnpm-debug.log*",
      "yarn-debug.log*",
      "",
    ].join("\n"),
  );

  console.log(`\nInstalling dependencies for ${workspaces.join(" and ")}...`);
  await run(packageManager, ["install"], root);
  console.log(
    `\nProject created successfully: ${projectName}/\n\nTo get started:\n  cd ${projectName}\n  ${packageManager} dev`,
  );
} catch (error) {
  console.error(`\nProject creation failed: ${error.message}`);
  process.exit(1);
}
