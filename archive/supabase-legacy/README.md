# Legacy Supabase SQL (archived)

These files are **historical only**. Do not apply them to new projects.

## Current source of truth

```
supabase/schema/01_core.sql
supabase/schema/02_world.sql
supabase/schema/03_social.sql
supabase/schema/04_security.sql
```

See `supabase/README.md` for apply order and client RPC contracts.

## What was here

| File | Role (before consolidation) |
|------|-----------------------------|
| `schema.sql` | Monolithic dump (drifted from migrations) |
| `migrations/auth_fix.sql` | Name-clean trigger |
| `migrations/crafting_update.sql` | Wood/stone, craft items, cut_resources |
| `migrations/shop_system_fix.sql` | `owned_cosmetics` buy flow |
| `migrations/friend_system.sql` | Social graph helpers |
| `migrations/security_fixes_1_12.sql` | Economy + proximity + RLS hardening |
| `migrations/p3_hardening.sql` | Reports, bans, friend rate limits |

All of the above is folded into the four modular schema files.
