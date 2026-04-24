---
name: hono
description: Use when building or modifying Hono routes, middleware, validation, streaming, JSX, testing, or APIs that import from `hono` or `hono/*`.
---

# Hono

Use the shared Hono reference in `.claude/skills/hono/SKILL.md`.

Apply it together with this repo's server architecture rules:

- Routes parse HTTP input and return responses.
- Services own business logic.
- Repositories own persistence and filesystem access.
- Inject route dependencies through Hono Context (`c.get()`).
