# Dash2 Local Development

Scope: local environment only. See `docs/runbooks/environments.md` for the full local/preview/staging/production environment matrix.

## Supported versions (recorded 2026-07-23)

- Node.js `>=22.0.0` (pinned via `.nvmrc`; local verification used Node v25.9.0, which satisfies the range — CI pins Node 22 for reproducibility).
- npm (bundled with Node); local verification used npm 11.12.1.
- Key toolchain versions resolved at scaffold time (see `package.json` / `package-lock.json` for the exact locked tree): TypeScript 5.9.3, Vite 8.1.5, `@cloudflare/vite-plugin` 1.47.0, Wrangler 4.114.0, Hono 4.12.31, React 19.2.8, Vitest 4.1.10, ESLint 10.7.0.

TypeScript 7.x was intentionally avoided: `typescript-eslint` does not yet support it (peer range `<6.1.0`), so the toolchain is pinned to the latest TypeScript 5.x line.

## Clean-checkout command sequence

```sh
nvm use            # or otherwise ensure Node >=22 is active
npm install
npm run db:migrate:local
npm run build
npm run dev         # local Worker + web app at http://localhost:5173
```

## Local database

D1 and KV bindings in `wrangler.jsonc` use placeholder identifiers (`database_id: 00000000-0000-0000-0000-000000000001`, KV `id: 00000000000000000000000000000002`). These only resolve against the local Wrangler/Miniflare simulation under `.wrangler/state` (gitignored) and do not reference any real Cloudflare account or resource. They are safe to keep in source.

```sh
npm run db:migrate:local          # apply all migrations to the local D1 database
npx wrangler d1 execute DASH2_DB --local --command "SELECT * FROM schema_version;"
```

To verify from a fully empty state, delete `.wrangler/` and re-run `npm run db:migrate:local`.

## Commands

| Command                           | Purpose                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Start the Worker + web app locally via `vite dev` (Cloudflare Vite plugin runs the Worker in `workerd`). |
| `npm run build`                   | Typecheck (`tsc --build`) then produce the production Worker and client asset bundles under `dist/`.     |
| `npm run preview`                 | Preview the production build locally.                                                                    |
| `npm run typecheck`               | `tsc --build` across the app/worker/node TypeScript project references.                                  |
| `npm run lint`                    | ESLint flat config across `src/`, `test/`, and root config files.                                        |
| `npm run format` / `format:check` | Prettier write/check.                                                                                    |
| `npm run test`                    | Run the Vitest suite once.                                                                               |
| `npm run db:migrate:local`        | Apply pending migrations to the local D1 database.                                                       |

## Verified evidence (M1.1, 2026-07-23)

- `npm install` — clean install succeeded (no vulnerabilities reported).
- `npm run typecheck` — passed with no errors.
- `npm run build` — Worker bundle (`dist/dash2/index.js`) and client bundle (`dist/client/`) both produced successfully.
- `npx wrangler d1 migrations apply DASH2_DB --local` — applied `0001_schema_version.sql` to a freshly deleted `.wrangler/` state, twice from empty, with a successful re-apply (`No migrations to apply!`) in between; row `{version: 1}` verified via `wrangler d1 execute`.
- `npm run dev` — Vite dev server started, `GET /` returned `200` with the expected HTML shell.

No secrets, credentials, or private content were used or produced by this verification.
