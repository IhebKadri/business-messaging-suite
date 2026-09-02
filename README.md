# Business Messaging Suite

A multi-tenant WhatsApp engagement platform: broadcast campaigns, a shared
team inbox, AI-assisted conversation triage, and a visual (React Flow)
automation builder — built on the WhatsApp Cloud API.

> **Status: work in progress.** This README tracks what's actually built,
> not the end-state vision — see [ROADMAP.md](./ROADMAP.md) for what's next.

## Why this exists

Most WhatsApp-marketing tools are thin CRUD wrappers around the Cloud API.
This project exists to demonstrate the parts of building one that are
actually hard: tenant isolation enforced at the data-access layer (not by
convention), an async message pipeline that survives webhook bursts and
provider retries, and a swappable AI layer for conversation triage that
doesn't hard-couple the domain logic to one LLM vendor.

## Architecture

```
apps/
  api/    NestJS backend — REST API, WhatsApp webhook ingestion, BullMQ
          workers, WebSocket gateway for the live inbox
  web/    React + Vite frontend — inbox, campaign builder, React Flow
          automation canvas
packages/
  shared/ TypeScript types/DTOs shared between api and web
```

Key design decisions (see inline doc comments at each file for the "why"):

- **Multi-tenancy**: shared Postgres database, row-level isolation enforced
  by a Prisma Client Extension that injects `tenantId` into every query
  against a tenant-scoped model — see
  [`prisma.service.ts`](./apps/api/src/common/prisma/prisma.service.ts).
  This is enforced at the data layer, not left to each service to
  remember.
- **Request-scoped tenant context** via `AsyncLocalStorage`, not passed as
  an explicit parameter through every function — see
  [`request-context.ts`](./apps/api/src/common/context/request-context.ts).
- **AI provider abstraction**: conversation triage (category/sentiment/
  suggested reply) runs behind an `AiProvider` interface, defaulting to a
  local Ollama model so the project costs nothing to run and demo.
- **Messaging provider abstraction**: the WhatsApp Cloud API sits behind a
  `MessagingProvider` interface for the same reason — swappable, testable
  with a fake in unit tests.
- **Structured logging + metrics + tracing** from day one
  (`nestjs-pino`, `prom-client`, OpenTelemetry), not bolted on at the end.

## Getting started

Prerequisites: Node 20+, pnpm 9+, Docker.

```bash
pnpm install

# Postgres, Redis, and a local Ollama instance
pnpm docker:up
docker exec -it business-messaging-suite-ollama ollama pull llama3.1

cp apps/api/.env.example apps/api/.env
# fill in WHATSAPP_* values — see "WhatsApp Cloud API setup" below

pnpm prisma:migrate
pnpm dev:api    # http://localhost:3000/docs for Swagger
pnpm dev:web    # http://localhost:5173
```

### WhatsApp Cloud API setup (free tier)

1. Create an app at [developers.facebook.com](https://developers.facebook.com)
   with the WhatsApp product added.
2. Meta gives you a **free test phone number** and up to 5 verified
   recipient numbers — no billing required for development.
3. Copy the temporary access token, phone number ID, and WABA ID into
   `apps/api/.env`.
4. Point the webhook (Meta dashboard → WhatsApp → Configuration) at
   `https://<your-tunnel>/v1/webhooks/whatsapp` (use `ngrok` or similar for
   local dev) with the verify token from your `.env`.

## Testing

```bash
pnpm test          # unit tests, all packages
pnpm --filter @business-messaging-suite/api test:e2e
```

## License

MIT
