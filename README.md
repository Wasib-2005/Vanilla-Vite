# Vanilla React

Create a React app with Vite, or choose another Vite template in the official interactive setup. Optionally add a Node.js or Express backend in the same npm or pnpm workspace.

[![npm version](https://img.shields.io/npm/v/create-vanilla-react)](https://www.npmjs.com/package/create-vanilla-react)
[![npm downloads](https://img.shields.io/npm/dm/create-vanilla-react)](https://www.npmjs.com/package/create-vanilla-react)
[![GitHub repository](https://img.shields.io/badge/GitHub-Wasib--2005%2Fvanilla--react-181717?logo=github)](https://github.com/Wasib-2005/vanilla-react)

**Links:** [npm package](https://www.npmjs.com/package/create-vanilla-react) · [GitHub repository](https://github.com/Wasib-2005/vanilla-react) · [Report an issue](https://github.com/Wasib-2005/vanilla-react/issues)

## Requirements

- Node.js 20 or newer
- npm or pnpm

## Create a project

With pnpm:

```bash
pnpm create vanilla-react@latest my-app
```

With npm:

```bash
npm create vanilla-react@latest my-app
```

Omit the project name to enter it when prompted:

```bash
pnpm create vanilla-react@latest
# or
npm create vanilla-react@latest
```

The generator starts the official `create-vite@latest` wizard in `my-app-client`. Choose **React** for a React application, then select JavaScript or TypeScript. You can instead choose any other template offered by Vite. Afterward, choose whether to add a backend (frontend-only is the default). The frontend wizard may install dependencies temporarily; the generator removes nested install files and Git metadata, configures one shared workspace, and installs all dependencies from the project root.

The optional backend supports JavaScript or TypeScript, either basic Node.js or Express, and a simple or module-based folder layout. Both layouts create the `src/app` and `src/server` entry points. The simple layout has `routes`, `controllers`, `middleware`, and `config` folders; the module-based layout has `module`, `config`, `middleware`, and `utils` folders plus `mainRouter`. Express adds Express and dotenv, enables JSON parsing, and provides `GET /api/health`, returning `{ "status": "ok" }`.

Pass `--default` after the project name to use the simple backend folder layout without prompting:

```bash
pnpm create vanilla-react@latest my-app --default
npm create vanilla-react@latest my-app --default
```

The generated project structure is:

```text
my-app/
├── my-app-client/       # Vite app; choose React or another Vite template
├── my-app-server/       # optional backend
├── scripts/
├── package.json
└── pnpm-workspace.yaml  # used by pnpm; npm uses package.json workspaces
```

The frontend gets a `.env.local` file with `VITE_API_URL=http://localhost:4000`. If you choose a backend, it gets a `.env` file with `PORT=4000`. Both are ignored by Git.

## Run the project

From the project root:

```bash
pnpm dev
# or
npm run dev
```

This starts the frontend and, if selected, the backend together. In an interactive terminal, press `r` to restart both apps, `c` to clear the terminal, or Ctrl+C to stop.

Run one workspace individually:

```bash
pnpm client
pnpm server
```

Or with npm:

```bash
npm run client
npm run server
```

The server commands are only available if you chose a backend. Add `-dev` to run a workspace in development mode, for example `pnpm client -dev` or `pnpm server -dev`.

## Add dependencies

With pnpm:

```bash
pnpm client add <package>
pnpm server add <package>
```

With npm:

```bash
npm install <package> --workspace=my-app-client
npm install <package> --workspace=my-app-server
```

## Development

To test the source before publishing:

```bash
pnpm exec node ./bin/create-template.mjs my-app
# or
npm exec -- node ./bin/create-template.mjs my-app
```

## License

ISC
