# Frederick Window Tinting — Migration to Next.js/Supabase/Vercel

## Context

Frederick Window Tinting (FWT) currently runs on a legacy stack: Google Apps Script + Google Sheets (as a database) + Shopify Liquid templates. The system handles scheduling, customer management, pricing, communication, invoicing, expenses, flat glass estimating, and bookkeeping — all tightly coupled to Google Sheets for real-time data.

The goal is to migrate FWT to the same modern stack used by FWG-ops and Frederick Apparel: **Next.js + Supabase + Vercel + GitHub**. The old system stays live until the new one is fully functional.

---

## The Bigger Picture: Unified Multi-Business Dashboard

Joe runs **4 businesses** (FWG, FWT, Frederick Apparel, VF Auto Styling) out of **4 connected commercial units (A-D)** at one physical location. Unit A is the shared lobby — any customer for any business walks in there. The team needs to quickly switch between business dashboards at the front counter.

**Vision:** A dashboard switcher in the top-left corner (like the website nav bar with FWG | FWT | FA | VF logos) lets anyone jump between business dashboards instantly. Each dashboard is its own app/repo but shares:
- **Supabase instance** (`yjpllbljqrczkfhodozi`) — shared DB, business-specific table prefixes
- **Twilio** — FWG already has voice+SMS; FWT has a Twilio number for notifications, plan to migrate FWT's Google Voice main line to Twilio for calls too
- **Google Calendar** — unified calendar with toggles per business
- **Auth/team** — shared team members across dashboards

The 4 businesses are currently under 2 LLCs but plan to merge into one entity. Four online presences, one physical operation.

---

## Architecture: Separate Repos

| Repo | Status | Domain |
|------|--------|--------|
| `fwg-ops` | Live | fwg-ops.vercel.app |
| `frederick-apparel` | Live | (FA domain) |
| `fwt-ops` | **New** | TBD |
| `vf-ops` | Future | TBD |

Each repo = own Vercel project, own deployment lifecycle. Interconnected via shared Supabase.

---

## FWT Feature Scope (Large)

Known modules to migrate:
- **Automotive booking** — customer-facing appointment scheduling (currently on Shopify + Apps Script)
- **Operations dashboard** — fetches Google Calendar appointments, displays for team
- **Communication system** — customer messaging (Twilio SMS already in place for notifications)
- **Invoicing system** — creating and managing invoices
- **Expense dashboard** — tracking business expenses
- **Flat glass dashboard** — separate workflow for commercial/residential flat glass
- **Flat glass estimator** — pricing/quoting tool for flat glass jobs
- **Google Sheets bookkeeping** — financial tracking tied into the system
- More to be discovered during legacy file review

### Future Considerations (not Phase 1)
- Migrate FWT main phone (Google Voice) to Twilio with voice calling (like FWG)
- New landing pages for Google Ads (may replace or supplement Shopify booking)
- Cross-business calendar with per-business toggle
- VF Auto Styling dashboard (4th business)
- Unified reporting across all businesses

### Migration Strategy: Feature-by-Feature

Migration happens **one module at a time**, old system stays live throughout:
1. Schema design → Supabase migration
2. API routes → Next.js
3. UI → React components
4. Data migration → Google Sheets → Supabase
5. Verification → Run both systems, compare
6. Cutover → Switch traffic for that module

---

## Repo Setup Instructions

### Step 1: Create the repo
```bash
# On GitHub: create new repo "fwt-ops" under fwg2113
# Then locally:
git clone https://github.com/fwg2113/fwt-ops.git
cd fwt-ops
```

### Step 2: Add legacy files
Organize all legacy code into `/legacy` subfolders:
```
fwt-ops/
├── legacy/
│   ├── apps-script/        # .gs files (server-side logic)
│   ├── html-templates/     # .html files (Apps Script UI templates)
│   ├── javascript/         # .js files (client-side scripts)
│   ├── shopify/
│   │   ├── liquid/         # .liquid template files
│   │   └── css/            # Shopify theme CSS
│   └── spreadsheets/       # Exported CSVs + header screenshots
```

### Step 3: Export spreadsheets
For each Google Sheet used by the system:
- Export each tab as CSV
- Screenshot any complex formula cells or named ranges
- Note the sheet name and purpose

### Step 4: Commit and push
```bash
git add legacy/
git commit -m "Add legacy FWT system files for migration reference"
git push
```

### Step 5: Start new Claude Code session
Open the `fwt-ops` directory in VS Code, start Claude Code, and use the kickoff prompt below.

---

## Kickoff Prompt for Next Session

See next steps section — the prompt is designed to give full context to a fresh Claude Code session.
