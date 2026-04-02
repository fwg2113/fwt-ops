# FWT-Ops Architecture Vision
## From Single-Shop Tool to Modular Service Industry SaaS

Last updated: 2026-03-26

---

## The Big Picture

This system started as a tool for Frederick Window Tinting. It is evolving into a modular, multi-service SaaS platform for the automotive aftermarket industry — and potentially beyond.

The guiding principle: **a shop only sees what they need.** A detail-only shop never sees tint. A tint-only shop never sees detailing. A full-service shop sees everything they've enabled. No module assumes another module exists.

---

## Core Architecture: Universal + Modular

### Universal Layer (every shop gets this)
These exist regardless of which service modules are enabled:

- **Shop Config** — name, address, contact, timezone, theme colors, branding
- **Team Members** — who works there, roles, schedules
- **Customer Database** — lifetime profiles, contact info, vehicle records, history across all services
- **Vehicle Database** — YMM with class keys (tint), size classes (detail/ceramic/PPF), and category groupings
- **Scheduling Engine** — weekly hours, closed dates, date overrides, capacity limits
- **Appointment Types** — Drop-off, Waiting, Heads-Up (30/60 min), **Mobile Heads-Up** (time windows)
- **Payment/Invoicing** — Stripe integration, deposits, CC fee pass-through, cash discounts
- **Communication** — SMS/messaging, booking confirmations, heads-up notifications
- **Landing Page** — configurable template per shop (or per brand), links to enabled services
- **Dashboard** — sidebar dynamically shows only enabled modules, Command Center aggregates all

### Service Modules (toggle on/off per shop)

Each module follows the same pattern:
```
Module = {
  Config:    services, pricing rules, module-specific settings
  Booking:   customer-facing page (or lead gen form)
  Dashboard: appointments, pipeline, settings tab
  Landing:   auto-generated card on shop landing page
}
```

#### Automotive Window Tint (BUILT)
- **Pricing**: YMM + class keys + film type + shade matrix (most complex)
- **Booking**: Full online booking with deposit
- **Vehicle DB**: Deep — class keys, split front/rear, custom per-vehicle pricing
- **Status**: ~80% complete

#### Flat Glass / Residential & Commercial (BUILT - prior work)
- **Pricing**: Sq ft / window count / room type
- **Booking**: Estimator flow
- **Vehicle DB**: Not needed
- **Status**: Estimator complete, dashboard pending

#### Detailing (PLANNED)
- **Pricing**: Vehicle size class + service list (simple)
- **Services**: Interior, exterior, wash, wax, paint correction, full detail, etc. (5-15 services)
- **Booking**: Online booking — select vehicle, pick services, choose time
- **Vehicle DB**: Light — just size buckets (Compact/Midsize/Full/SUV/Large SUV-Truck)
- **Mobile support**: Mobile Heads-Up Appointments (time windows, not exact times)

#### Ceramic Coating (PLANNED)
- **Pricing**: Vehicle size class + package tiers (Basic/Standard/Premium)
- **Booking**: Online booking or lead gen (shop chooses)
- **Vehicle DB**: Light — size buckets
- **Note**: Some shops require inspection before quoting, so lead-gen mode is important

#### Paint Protection Film / PPF (PLANNED)
- **Pricing**: Vehicle-specific + coverage zones (full front, partial, track pack, etc.)
- **Booking**: Lead gen with pricing ranges, or online booking for standard packages
- **Vehicle DB**: Medium — some vehicles need custom PPF pricing (Tesla vs standard)

#### Vehicle Wraps (PLANNED)
- **Pricing**: Too variable for online booking — lead gen only
- **Booking**: Quote request form (vehicle info, wrap type, reference images, contact)
- **Vehicle DB**: Minimal — make/model for reference only
- **Pipeline**: Goes into leads, not appointments. Human finalizes quote.

#### Future Modules (TEMPLATE READY)
- Paintless Dent Repair
- Window Repair/Replacement
- Graphics/Lettering
- Any service a shop wants to add

---

## Multi-Brand Support

### The Problem
Shops commonly operate multiple brands from one location:
- Frederick Window Tinting (auto tint, flat glass)
- Frederick Wraps & Graphics (wraps, PPF, graphics)
- Same address, same team, same schedule, different customer-facing identity

### The Solution: One Tenant, Multiple Brand Profiles

```
shop_config (one per tenant)
  └── brands[] (array of brand profiles)
        ├── Brand 1: "Frederick Window Tinting"
        │   ├── theme colors (ext)
        │   ├── landing page config
        │   ├── enabled modules: [auto_tint, flat_glass]
        │   └── public URL / custom domain
        └── Brand 2: "Frederick Wraps & Graphics"
            ├── theme colors (ext)
            ├── landing page config
            ├── enabled modules: [wraps, ppf, graphics]
            └── public URL / custom domain
```

**Shared across brands:** vehicle DB, customers, team, schedule, location, dashboard
**Separate per brand:** public pages, theme, enabled modules, landing page

---

## Mobile Heads-Up Appointments

A universal appointment type for any mobile service (mobile tint, mobile detail, PDR, locksmith, etc.).

### How It Works
1. Customer selects a **day**
2. Customer selects a **time window**: Morning (8-11am), Mid-Day (11am-2pm), Afternoon (2-5pm)
3. Customer confirms they will be at the location during that window
4. Customer provides **service address** (validated against service area)
5. Service provider sends a "heads-up" notification (e.g., "On my way — ETA 30 min")

### Scheduling Rules
- Time windows have capacity limits (e.g., max 2 morning, 2 midday, 2 afternoon)
- System prevents overlap/double-booking within windows
- Service area validation: address must be within configured radius or zone list
- Travel time buffer between appointments (configurable)
- Calendar shows bookings by window, not exact time

### Why This Works
- Provider isn't locked to an exact time (traffic, previous job running long, etc.)
- Customer gets a reasonable expectation without false precision
- Provider sends real-time ETA when actually en route
- Derived from the existing Heads-Up appointment system built for auto tint

---

## Vehicle Database Expansion

The existing `auto_vehicles` table (1,337 vehicles) has `class_keys` for tint pricing. Expansion:

### New Column: `size_class`
Maps every vehicle to a size bucket for detailing/ceramic/PPF pricing:
- **Compact** — Civic, Corolla, Model 3, Golf
- **Midsize** — Camry, Accord, Model Y, A4
- **Full Size** — Charger, Impala, Model S, 5 Series
- **SUV** — RAV4, CX-5, X3, Model X
- **Large SUV / Truck** — Tahoe, F-150, Expedition, Suburban

One vehicle database, multiple pricing dimensions. Class keys for tint, size class for everything else.

---

## Modular Pricing

### The principle: each module defines its own pricing model

| Module | Pricing Inputs | Output |
|--------|---------------|--------|
| Auto Tint | vehicle class_key + service + film + shade | exact price |
| Detailing | vehicle size_class + service | exact price |
| Ceramic | vehicle size_class + package tier | exact price |
| PPF | vehicle + coverage zone | exact price or range |
| Wraps | vehicle + wrap type | lead gen (no price) |
| Flat Glass | sq ft + film + zone | estimate |

Each module has its own pricing table. No module depends on another module's pricing.

---

## Financial Model (SaaS Tiers)

### Revenue Streams
1. **Subscription fees** — monthly per-shop
2. **Transaction fees** — percentage of each payment processed through the platform (via Stripe Connect)
3. **Add-on modules** — per-module pricing on top of base tier
4. **Premium features** — lock box integration, custom domains, multi-brand, etc.

### Stripe Connect Architecture
- Platform account (ours) connects to each shop's Stripe account
- Shop onboards via Stripe's hosted onboarding flow (identity, bank, tax — Stripe handles it all)
- Payments from customers go to the shop's connected account with platform fee automatically skimmed
- Platform fee is pure profit (Stripe processing fees come from the gross, not from our cut)
- Stripe handles 1099 tax reporting for all connected accounts
- Shop's Stripe account ID stored in `shop_config.stripe_account_id`

### Transaction Fee Economics (example at 3% platform fee)
```
Customer pays $500 for Full Sides Ceramic i3
  Stripe processing fee (2.9% + $0.30):  -$14.80
  Platform fee (3%):                      -$15.00   ← our revenue
  Shop receives:                           $470.20
```

### Pricing Tiers (not locked in — built flexible)

| Tier | Monthly | Transaction Fee | Includes |
|------|---------|-----------------|----------|
| **Starter (Free)** | $0 | 3% | Core features, 1 module, 1 brand |
| **Professional** | $79-99 | 1.5% | All features, 3 modules, full booking |
| **Business** | $199-249 | 0% | Everything, unlimited modules, multi-brand, custom domain |
| **Enterprise** | Custom | Custom | Multi-location, API access, white-label |

The free tier with transaction fee is the growth engine — zero friction to start, revenue scales with shop success. High-volume shops self-upgrade to drop the fee when the math tips.

### Schema for Stripe Connect
```sql
shop_config:
  stripe_account_id text        -- connected Stripe account ID (acct_xxx)
  stripe_onboarded boolean      -- completed Stripe onboarding
  platform_fee_percent numeric  -- transaction fee for this shop's tier (0, 1.5, 3)
```

### Implementation Priority
1. Direct Stripe integration for FWT (our shop — simple, no Connect needed)
2. Stripe Connect onboarding flow for SaaS shops (Phase 4+)
3. Platform fee configuration per pricing tier

---

## Page Routing Strategy

### The Problem
A tint shop sending customers to a page that also shows wraps and detailing creates confusion. A full-service shop wants one page showing everything. Different shops need different approaches.

### The Solution: Three Page Modes (shop chooses in Settings)

**Standalone Mode** — each service gets its own dedicated page with its own URL:
```
/book/tint          → auto tint booking flow
/book/detail        → detailing booking flow
/book/ceramic       → ceramic coating booking/lead gen
/book/ppf           → PPF lead gen
/book/wraps         → wraps quote request
/estimate/flat-glass → flat glass estimator
```
Each page is fully independent. Shop sends tint customers to `/book/tint`, detail customers to `/book/detail`. No cross-contamination. Each URL can be shared, bookmarked, or linked from Google Ads independently.

**Combined Mode** — one landing page at `/` or `/services` showing a card for each enabled service:
```
/services
  ├── [Auto Window Tint card]  → clicks to /book/tint
  ├── [Detailing card]         → clicks to /book/detail
  ├── [Ceramic Coating card]   → clicks to /book/ceramic
  └── [Vehicle Wraps card]     → clicks to /book/wraps
```
Customer picks which service they need, clicks through to that service's dedicated booking flow. The combined page is a router — the actual booking pages underneath are the same standalone pages.

**Both Mode** (recommended default) — combined landing page exists AND all standalone URLs work:
- Shop can link to `/services` for general traffic (website footer, Google Business listing)
- Shop can link to `/book/tint` for targeted traffic (tint-specific ads, social posts)
- Best of both worlds, no tradeoffs

### Settings Toggle
```
shop_config.page_mode: 'standalone' | 'combined' | 'both'
```
- **Standalone**: no combined page, only individual service URLs
- **Combined**: combined landing page at root, individual pages accessible via navigation
- **Both**: everything works (default)

### Per-Module Display Config
Each service module stores its card info for the combined page:
```
{
  title: "Auto Window Tint",
  description: "Premium ceramic films for your vehicle",
  icon: "...",        // SVG or uploaded image
  sort_order: 1,      // display order on combined page
  cta_text: "Book Now" // or "Get Estimate", "Request Quote"
}
```

### URL Structure with Custom Domains
```
Default:  {shop-slug}.platform.com/book/tint
Custom:   booking.yourshop.com/book/tint
          booking.yourshop.com/services (combined page)
```

### Multi-Brand URL Routing
When a shop has multiple brands:
```
Brand 1 (Frederick Window Tinting):
  tinting.frederick.com/book/tint
  tinting.frederick.com/estimate/flat-glass

Brand 2 (Frederick Wraps & Graphics):
  wraps.frederick.com/book/wraps
  wraps.frederick.com/book/ppf
```
Each brand only shows its own enabled modules on its combined page.

---

## Landing Pages & Custom Domains

### Per-brand landing pages:
- Each brand gets a configurable landing page template
- Sections: hero (shop name, tagline, image), services grid (links to enabled modules), hours/location, contact
- Theme colors from brand profile
- Responsive, fast, SEO-friendly

### URL structure:
- Default: `{shop-slug}.platform-domain.com`
- Custom: `booking.yourshop.com` (CNAME to Vercel, verified via API)

### Vercel integration:
- Each custom domain added via Vercel Domains API
- Shop configures CNAME in their DNS
- Platform verifies and attaches to the project
- No embedding required — clean standalone pages

---

## Communication System (Twilio)

### Architecture: Twilio Subaccounts (ISV Model)

The platform registers as an ISV (Independent Software Vendor) with Twilio. Each shop gets a subaccount with their own dedicated phone number, provisioned automatically during onboarding.

### Why Subaccounts
- Each shop gets a real, dedicated local phone number (matched to their area code)
- Customers can text back to that number
- Shop never touches Twilio — it just works in their dashboard
- Platform controls everything from one master Twilio account
- Professional experience for the end customer

### Compliance (A2P 10DLC)

**Platform level (one-time):**
- ISV registration with Twilio (~1-2 weeks approval)
- Campaign Use Case registration (~$15 one-time) — describes message types: appointment confirmations, vehicle ready alerts, payment reminders, heads-up ETAs

**Per-shop (automated via API):**
- Brand Registration (~$4 one-time per shop, 1-3 day approval)
- Shop fills out business info during onboarding (name, EIN, address)
- Platform submits Brand registration via Twilio API automatically
- Shop is added to the already-approved campaign — fast-tracked approval

### Message Types
| Message | Trigger | Template Example |
|---------|---------|-----------------|
| Booking Confirmation | After payment/booking | "Your appointment is confirmed for {date} at {time}. {shop_name}" |
| Day-Before Reminder | Cron job, day before | "Reminder: Your appointment is tomorrow at {time}. {shop_name}" |
| Vehicle Ready | "Ready" button on timeline | "Your vehicle is ready for pickup! {shop_name}" |
| Heads-Up ETA | "Send Heads-Up" button | "We're on our way — ETA {minutes} min. {shop_name}" |
| Invoice/Payment | Invoice sent remotely | "Your invoice is ready: {link}. {shop_name}" |
| Custom Message | "Message" button | Free-form text from team member |

### Cost Structure
| Item | Cost | Notes |
|------|------|-------|
| ISV registration | Free | One-time application |
| Campaign registration | $15 one-time | Per campaign type |
| Brand registration | $4 one-time | Per shop, automated |
| Phone number | ~$1.15/month | Per shop |
| SMS sent | ~$0.0079 | Per message segment |
| SMS received | ~$0.0079 | Per message segment |

A busy shop (~300-500 msgs/month) costs ~$5/month total in Twilio fees. Include in subscription tier or meter separately.

### Onboarding Flow (shop experience)
1. Shop fills out business info (already in shop_config)
2. System auto-creates Twilio subaccount
3. System purchases local phone number (area code matched)
4. System registers Brand via A2P API
5. System creates Campaign under ISV profile
6. 1-3 days: approval comes back
7. Shop sees "Your messaging number is (XXX) XXX-XXXX — ready to go"
8. During approval wait: platform number used as temporary fallback

### Schema
```sql
shop_config:
  twilio_subaccount_sid text      -- Twilio subaccount SID
  twilio_phone_number text        -- shop's dedicated phone number
  twilio_messaging_enabled boolean -- true after A2P approval
  twilio_brand_status text        -- 'pending' | 'approved' | 'failed'
```

### For FWT (current shop)
Direct Twilio integration using existing account + number. No subaccount needed. Ready to wire immediately.

---

## What NOT to Build Into This Repo

If expanding beyond automotive (HVAC, plumbing, electrical, etc.):
- **Separate product/repo** built on the same technology stack
- **Shared libraries** extracted from this codebase (scheduling engine, payment, communication, customer DB patterns)
- **Different branding and positioning** — automotive SaaS vs home services SaaS
- The automotive focus keeps this product sharp and the brand clear

---

## Build Order (Updated)

### Phase 1: Complete Auto Tint MVP (CURRENT)
- Dashboard appointments page, check-in/checkout
- Stripe deposit integration
- Communication module (booking confirmations)
- Historical data migration

### Phase 2: Service Module Framework
- `service_modules` table and toggle system
- Dynamic sidebar based on enabled modules
- Abstract the booking page pattern
- Vehicle size class column + seed

### Phase 3: Detailing Module (Prove the Pattern)
- Simple service + size class pricing
- Online booking flow
- Dashboard appointments for detailing
- Mobile Heads-Up appointment type

### Phase 4: Multi-Brand Support
- Brand profiles on shop_config
- Per-brand landing pages and themes
- Brand-scoped public pages

### Phase 5: Additional Modules
- Ceramic Coating
- PPF
- Wraps (lead gen)
- Each follows the proven module pattern

### Phase 6: Platform Features
- Custom domains
- Analytics/reporting
- Onboarding wizard
- Billing/subscription management
