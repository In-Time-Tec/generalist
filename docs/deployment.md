# Deployment

The documentation site is the Foldkit + StyleX app in this directory. `bun run --cwd docs build` produces the client bundle in `docs/dist/client` and the SSR entry in `docs/dist/server`; `bun docs/server/main.ts` serves static assets, renders pages, and answers `/health`. `PORT` selects the listener (default 3000) and `ORIGIN` is the public origin used for canonical URLs behind a reverse proxy.

[`Dockerfile`](Dockerfile) packages the site: it installs the workspace, runs the docs build, reinstalls only the `@generalist/docs` production dependencies, and starts `server/main.ts`. [`railway.json`](railway.json) deploys that Dockerfile on Railway with `/health` as the healthcheck.

Before merging documentation changes, run:

```console
bun run docs:build
```

This checks the `docs/features` pages and runs both Vite builds. `bun run dev` starts the local dev server.
