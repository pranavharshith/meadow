# Supabase schema

## Source of truth

The **only** authoritative database definition lives in:

```
supabase/schema/
  01_core.sql
  02_world.sql
  03_social.sql
  04_security.sql
```

Apply these four files **in order** in the Supabase SQL editor (Dashboard → SQL → New query).

| Order | File | Contents |
|------:|------|----------|
| 1 | `schema/01_core.sql` | Extensions, `players`, rate limits, position, profile/cosmetics, spawn, world tree |
| 2 | `schema/02_world.sql` | Trees, rocks, plots, crafted items, cut resources, world RPCs |
| 3 | `schema/03_social.sql` | Friends, reports, chat, moderation, admin ban |
| 4 | `schema/04_security.sql` | RLS policies, REVOKE DML, GRANT execute, realtime publication |

All scripts are **idempotent** (`create table if not exists`, `add column if not exists`, `create or replace function`, `drop policy if exists`).

## Deprecated / archived

These paths are **no longer the source of truth**. Do not apply them on new projects:

- `supabase/schema.sql` — monolithic legacy dump
- `supabase/migrations/*` — incremental patches already folded into `schema/01`–`04`

Keep them only as historical reference. Any future schema change should edit the modular files under `schema/` and re-apply 01→04 (or a targeted follow-up migration that will later be folded back into the modules).

## Client notes

RPC signatures must match `src/net/Net.jsx`. Notable contracts:

- `update_profile(p_name, p_color, p_head_color, p_body_color, p_leg_color, p_hat_id)`
- `buy_cosmetic(p_type, p_id, p_color)` — inventory via `owned_cosmetics`
- `place_rock(...)` — **no** `p_cost`; server derives gold cost from shape
- `place_crafted_item(..., p_cost_wood, p_cost_stone)` — client may send costs; **server ignores** and uses catalog
- `send_region_chat` / `send_world_chat` — server-emitted via `realtime.send`
- `update_position` — required before proximity-gated world RPCs
- `cut_tree` returns a **player row** (`wood`), not a gold scalar
- `remove_rock` returns **gold** (integer refund)

## Auth setup

1. Enable **Anonymous sign-ins** under Authentication → Providers.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend `.env`.
3. Optional admin: set JWT `app_metadata.role = 'admin'` for `admin_set_ban`.
