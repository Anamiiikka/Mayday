# Mayday

**Mayday answers your alerts: it diagnoses in a sandbox and fixes only with your approval.**

An approval-gated incident responder built on [TrueForge](https://trueforge.dev) for the
[Agent Harness Hackathon](https://www.wemakedevs.org/hackathons/trueforge) (Aug 24–30, 2026).

When an alert fires, the agent investigates through read-only MCP tools, runs diagnostic
scripts in an isolated sandbox, and proposes a remediation (restart / rollback / scale) —
then pauses at a human approval gate before anything irreversible happens.

## Status

Day 1: landing page. Command Room dashboard, fake-cloud MCP server, and TrueForge agent
wiring land over the week — see the repo's pull requests for the build trail.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Full setup instructions (Neon database, TrueForge server, model keys) will land here with
the agent wiring. No secrets are committed; copy `.env.example` to `.env.local` when it
appears and bring your own keys.
