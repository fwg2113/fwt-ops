# FWT-Ops — Claude Code Instructions

**READ THIS FULLY BEFORE EVERY TASK. These rules override default behavior.**

---

## What This Project Is

FWT-Ops is a **modular SaaS platform** for the automotive aftermarket industry. It started as a tool for Frederick Window Tinting but is being built as the #1 SaaS for tint shops, detail shops, wrap shops, and beyond. Joe Volpe (the owner) will use this system himself — he is both the builder and the first customer. Every feature must work for his shop AND for any future shop that subscribes.

**The full architectural vision is documented in `/ARCHITECTURE_VISION.md` — read it when working on anything structural.**

---

## THE #1 RULE: SaaS-First, Always

**EVERY feature, setting, value, button, color, flow, and behavior must be configurable per shop.** This is not a suggestion — it is the foundational principle of the entire system.

Before writing ANY code, ask: "Would a different shop need this to work differently?" If yes (and the answer is almost always yes), make it a setting in `shop_config` or a module-level config.

**The pattern:** `enabled (true/false)` → if true, `configure the details`

**Examples of what this means in practice:**
- Don't hardcode "Check In" as a button label — make it editable per shop
- Don't hardcode the checkout flow as Check In → Work → Ready → Invoice → Pay — make the flow configurable
- Don't hardcode which action buttons appear on appointment cards — let the shop choose
- Don't hardcode film card colors — use the global theme system
- Don't hardcode message templates — let shops edit them
- Don't assume tint is the primary service — it's one module among many
- Don't build features that assume another module exists (detailing shouldn't require tint)

**If you catch yourself hardcoding a business value, STOP and make it a setting.**

---

## How to Work With Joe

- **Learn first, propose second, execute only when approved.** Don't make changes without explaining what and why.
- **Joe is completely teachable** — he has 18 years of tinting experience but is new to SaaS architecture. When there's a better approach, SAY SO. He wants suggestions and will change direction if it serves the product.
- **Joe thinks fast and big** — he'll often share a vision mid-conversation that expands the scope. Capture these ideas in memory/docs rather than trying to build everything immediately.
- **NEVER use emojis anywhere** — not in code, not in UI, not in messages. Use inline SVG icons instead.
- **Don't summarize what you just did at the end of every response** — Joe can read the diff. Be concise.
- **Ask questions when things are ambiguous** — don't assume and build the wrong thing.

---

## Architecture Overview

### Tech Stack
- **Frontend:** Next.js 15 (App Router, React 19)
- **Backend:** Next.js API routes + Supabase (Postgres + Auth + Storage)
- **Payments:** Stripe (direct for FWT, Stripe Connect for SaaS shops)
- **Communication:** Twilio (direct for FWT, ISV subaccounts for SaaS shops)
- **Email:** Resend
- **Hosting:** Vercel
- **Styling:** All inline styles — no CSS modules, no Tailwind (except booking page CSS variables)

### System Structure
```
Universal Layer (every shop gets this):
  shop_config, customers, team_members, vehicle database,
  scheduling engine, appointments, invoicing, payments,
  communication, landing page, dashboard

Service Modules (toggle per shop):
  Auto Tint (built) — YMM pricing, film/shade, class keys
  Flat Glass (built) — sq ft, room types
  Detailing (planned) — vehicle size class pricing
  Ceramic Coating (planned) — size class + package tiers
  PPF (planned) — vehicle-specific + coverage zones
  Wraps (planned) — lead gen only, no online pricing
```

### Key Architectural Decisions
- **Appointments and Invoicing are universal** — they live at the top level, not under any service module
- **The sidebar dynamically shows only enabled modules** (controlled by shop_config module toggles)
- **Multi-brand support** — one tenant can have multiple customer-facing brands (e.g., "Frederick Window Tinting" + "Frederick Wraps & Graphics") sharing the same team, schedule, and location
- **Three page modes** — Standalone (per-service URLs), Combined (landing page linking to services), or Both
- **Mobile Heads-Up Appointments** — universal appointment type for mobile services, time windows not exact times

### Theme System
- **External theme** (customer-facing): 4 colors in `shop_config` (theme_ext_primary/secondary/accent/background) — controls booking page via CSS variables, film card defaults
- **Internal theme** (dashboard): 5 colors in `shop_config` (theme_int_primary/accent/background/surface/text) — controls dashboard via CSS variables injected by ThemeProvider
- **Per-film card overrides** cascade on top of the global external theme
- Film cards support 3 layouts (classic/horizontal/minimal), custom metrics, custom images, badges, and per-film styling

### Payment Architecture
- **FWT (current):** Direct Stripe integration — deposits via Stripe Checkout, webhook confirms booking
- **SaaS shops:** Stripe Connect — each shop connects their own Stripe account, platform takes configurable fee
- **Three checkout flows:** Counter (guided on-site), Remote (send invoice link), Self-checkout (QR code in shop)
- **Invoice creation timing and checkout availability must be shop-configurable** — don't force a rigid flow

### Communication Architecture
- **FWT (current):** Direct Twilio account
- **SaaS shops:** Twilio ISV subaccounts — each shop gets a dedicated phone number, platform manages compliance
- **Action buttons with messaging:** Each button on appointment cards can trigger a configurable message template with variable substitution ({customer_name}, {vehicle_year}, {shop_name}, etc.)

---

## Critical Files to Know

| File | Purpose |
|------|---------|
| `ARCHITECTURE_VISION.md` | Full system vision — read for any structural decisions |
| `src/app/components/dashboard/theme.ts` | Theme system — `buildColors()` computes all dashboard colors from 5 inputs |
| `src/app/components/dashboard/ThemeProvider.tsx` | Injects CSS variables for dynamic dashboard theming |
| `src/app/components/booking/FilmCard.tsx` | Film card component — 3 layouts, config-driven, per-film customization |
| `src/app/components/booking/types.ts` | All booking types — ShopConfig, AutoFilm, AutoFilmShade, BulkConfig |
| `src/app/components/Sidebar.tsx` | Dashboard sidebar — uses CSS variables for theme colors |
| `src/app/(dashboard)/layout.tsx` | Dashboard layout — wraps everything in DashboardThemeProvider |
| `src/app/(dashboard)/settings/tabs/` | All settings tabs — General, Schedule, Services, Films, Vehicles, etc. |
| `src/app/api/auto/config/route.ts` | Bulk config API — returns everything the booking page needs |
| `src/app/api/auto/checkout/route.ts` | Stripe Checkout session creation |
| `src/app/api/stripe/webhook/route.ts` | Stripe webhook handler |
| `src/app/lib/stripe.ts` | Stripe server client |
| `src/app/lib/supabase-server.ts` | Supabase admin client |

---

## Memory System

Project memory is stored at `~/.claude/projects/-Users-joevolpe-fwt-ops/memory/`. The index is at `MEMORY.md` in that directory. Read it at the start of relevant tasks. Key memory files:

- `project_modular_saas_architecture.md` — modular SaaS vision, multi-brand, build order
- `project_invoice_checkout_vision.md` — three checkout flows, Roll ID auto-application
- `project_roll_ids_and_lockboxes.md` — Roll ID killer feature, lock box management
- `project_twilio_communication.md` — Twilio ISV subaccount architecture
- `feedback_saas_checkout_flow.md` — DON'T force rigid checkout flows
- `feedback_saas_first_always.md` — the SaaS-first mandate with examples
- `reference_legacy_booking_system_architecture.md` — complete legacy system analysis

**Keep memory up to date.** When significant decisions are made, features are completed, or architectural direction changes, update or create the relevant memory file. Don't let memory go stale.

---

## What NOT to Do

- **Don't hardcode business values** — every value is a shop_config setting
- **Don't build features that only work for FWT** — build for any shop, FWT's config is one option
- **Don't assume a linear appointment flow** — different shops have different workflows
- **Don't assume tint is enabled** — a detailing-only shop should never see tint references
- **Don't open customer-facing pages from the dashboard** — the team uses the dashboard, customers use the public pages
- **Don't use emojis** — inline SVG icons only
- **Don't build without proposing first** — learn the context, propose the approach, get approval
- **Don't ignore the architecture doc** — read `ARCHITECTURE_VISION.md` for structural decisions
- **Don't duplicate code across modules** — if it's universal (scheduling, payments, customers), it belongs in the universal layer
- **Don't forget to update this file** — if you make significant architectural changes, add them here so future sessions stay aligned

---

## Keeping This File Current

**This file must be kept up to date.** When any of the following happen, update this file:
- New modules or major features are added
- Architectural decisions change
- New patterns or conventions are established
- Key files are moved or renamed
- New integrations are added (Stripe, Twilio, etc.)
- The build order or priorities shift

If you notice something in this file that is outdated or wrong based on the current codebase, fix it immediately and note the change.
