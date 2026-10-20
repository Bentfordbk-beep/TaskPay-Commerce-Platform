# TaskPay

TaskPay is a Ghana-first digital commerce and opportunity platform for shopping, learning, affiliate promotion, campaigns, and events.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/taskpay run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed:taskpay` — seed categories and platform defaults (no users, products, or transactions)
- Required env: `DATABASE_URL` — Postgres connection string
- Admin bootstrap: set `ADMIN_EMAIL` to the verified Clerk account email that should receive the initial administrator role.
- Clerk: use the Replit-managed Clerk configuration; never place Clerk keys in source files.
- Payments: no provider is configured. Checkout and ticket purchases intentionally do not create orders, charges, or tickets until a supported payment flow is connected and verified.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/taskpay` — TaskPay web application, public assets, and PWA install metadata
- `artifacts/api-server/src/routes` — API route handlers
- `artifacts/api-server/src/middlewares/taskpayAuth.ts` — verified Clerk identity, local account provisioning, and role checks
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema` — Drizzle/Postgres schema
- `scripts/src/seed-taskpay.ts` — idempotent category/default seed
- `artifacts/taskpay/public/icons` — square TaskPay PNG icons derived from the provided logo

## Architecture decisions

- API request and response validation, generated hooks, and generated Zod schemas come from the OpenAPI contract.
- Clerk authenticates users; TaskPay stores a separate local account and enforces roles on the API.
- Monetary values are stored as integer minor units and the initial currency is GHS.
- Public product listings require an approved vendor with an active membership window.
- Payment-dependent records are never marked paid from a browser action; payment integration and server-side verification are still required.

## Product

The responsive web app includes separate physical and digital product catalogues, product details and carts, account/dashboard, vendor applications and listings, affiliate applications and links, campaign applications and submissions, course/event listings, support, wallet/payout requests, and administrator review/settings screens.

## User preferences

- Use the user's supplied TaskPay logo artwork for the official web-app icon assets; do not substitute or redesign it.

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`.
- Run the category seed once against the development database before relying on category filters and vendor submissions.
- Do not enable paid memberships, checkout, ticket issuance, or withdrawals until server-side provider verification and settlement handling are implemented.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
