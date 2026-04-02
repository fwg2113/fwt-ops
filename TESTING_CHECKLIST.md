# FWT-Ops Testing Checklist -- Session Build (2026-03-31/04-01)

Use this to systematically test everything built, modified, and revised.
Mark items with [x] as you verify them.

---

## 1. Settings Page -- Left Sidebar Nav

### Navigation
- [ ] Settings page loads with left sidebar nav (not the old horizontal tabs)
- [ ] SHOP section visible: Shop Info, Brands, Modules, Team, Appearance
- [ ] OPERATIONS section visible: Schedule, Closed Dates, Notifications, Checkout, Action Buttons, Payment, Discounts & Warranty
- [ ] AUTO TINT section visible (only when auto_tint is enabled in Modules)
- [ ] Clicking each tab loads the correct content
- [ ] Active tab shows red left border + red text
- [ ] Section headers show correct colors (AUTO TINT uses module color from DB)
- [ ] Disabling auto_tint in Modules tab makes the AUTO TINT section disappear
- [ ] Re-enabling auto_tint brings it back
- [ ] If you're on an auto tint tab when it gets disabled, you get redirected to Shop Info

### Shop Info Tab
- [ ] Shop name, phone, email, address, timezone all load with current values
- [ ] Editing and saving works (verify in DB or refresh)
- [ ] Platform feature toggles (Communication, Statistics, Bookkeeping, Lock Boxes, Inventory) save correctly
- [ ] Toggling a platform feature and saving updates the sidebar visibility

### Appearance Tab
- [ ] External theme: 4 color pickers load with current values
- [ ] Booking page preview updates live as you change colors
- [ ] Internal theme: 5 color pickers load with current values
- [ ] All 15 presets load correctly (Crimson, Ocean, Garage, Showroom, etc.)
- [ ] Clicking a preset updates all 5 pickers
- [ ] Dashboard preview updates live
- [ ] "Save as My Custom" saves the current colors as a custom preset
- [ ] Custom preset appears in the preset list
- [ ] Saving applies the theme to the entire dashboard
- [ ] Showroom (light theme): input field borders are visible, not invisible
- [ ] Garage theme: input field borders have adequate contrast
- [ ] Test 3-4 different presets -- borders, inputs, cards should all be readable

### Notifications Tab
- [ ] 24hr and 1hr reminder toggles load correctly
- [ ] Template text areas load with current templates
- [ ] Variable hints are visible ({customer_first_name}, {shop_name}, etc.)
- [ ] Review request toggle, delay, template, and link all load
- [ ] Saving persists all values

### Payment Tab
- [ ] CC fee %, flat fee, and cash discount % load correctly
- [ ] Saving works

### Checkout Tab
- [ ] Checkout flow settings (invoice creation, self-checkout, payment timing) load and save
- [ ] Self-checkout QR section works (enable toggle, heading, subtext)
- [ ] Signature & Acknowledgment section loads and saves
- [ ] Invoice Brand Display section only appears when shop has 2+ brands
- [ ] Auto vs fixed brand mode dropdown works
- [ ] Fixed mode shows brand dropdown
- [ ] Quote Approval Modes section appears with three toggleable cards
- [ ] Disabling a mode that's the default auto-switches the default
- [ ] Default mode dropdown only shows enabled modes
- [ ] Saving persists all approval mode settings

### Action Buttons Tab
- [ ] Message templates load and are editable (add, edit, delete)
- [ ] Action buttons list loads with existing config
- [ ] Each button expandable with full config (label, colors, behavior, visibility rules)
- [ ] Adding custom buttons works
- [ ] Saving persists

### Auto Tint Section
- [ ] Booking Config: pricing model, max days out, cutoff, deposit, appointment types, GC settings all load and save
- [ ] Services tab: services list, enable/disable, shade rules -- all unchanged behavior
- [ ] Films tab: film list, pricing matrix, card customization -- all unchanged behavior
- [ ] Vehicles tab: vehicle list, search, add/edit -- all unchanged behavior

---

## 2. Brands System

### Brands Tab
- [ ] Existing brands (FWT, FWG) load with correct data
- [ ] Brand rows show logo (if uploaded) or color dots
- [ ] Default badge shows on the default brand
- [ ] Short name badge appears when set
- [ ] Active/Inactive toggle works
- [ ] "Set as Default" works (old default gets unset)
- [ ] Cannot delete the default brand (button hidden)
- [ ] Can delete non-default brands
- [ ] Edit: inline form expands below the brand row
- [ ] Edit: all fields editable (name, short name, email, phone, website, colors)
- [ ] Edit: Save/Cancel buttons work

### Logo Upload
- [ ] Click the square (1:1) placeholder to upload an image
- [ ] Click the wide (2:1) placeholder to upload an image
- [ ] Accepts PNG, JPG, WebP, SVG
- [ ] Upload shows loading state
- [ ] After upload, logo preview appears in the edit section AND in the brand row

### Max 4 Brands
- [ ] When 4 brands exist, "Add Brand" section shows the limit message
- [ ] Adding a brand when under 4 works (form appears, fields work, saves correctly)
- [ ] New brand gets correct sort_order

---

## 3. Modules Tab

- [ ] All 7 modules load (auto_tint, flat_glass, detailing, ceramic_coating, ppf, wraps, signage)
- [ ] Grouped by parent_category (AUTOMOTIVE, HOME_SERVICES, etc.)
- [ ] Each module shows colored dot + label
- [ ] Enable/disable toggle saves immediately
- [ ] Enabled modules show online mode dropdown + brand assignment
- [ ] Online mode options: Full Booking, Pricing Only, Internal Only
- [ ] Brand assignment dropdown shows active brands
- [ ] Changing online mode saves immediately
- [ ] Changing brand saves immediately
- [ ] Disabled modules are dimmed (opacity 0.5)
- [ ] Advanced expand button shows appointment types + deposit overrides
- [ ] Appointment type checkboxes (dropoff, waiting, headsup 30/60) save on Save click
- [ ] Deposit override: toggle on, then configure amount/required/refundable/hours
- [ ] Sidebar updates: enabling/disabling auto_tint or flat_glass updates the sidebar sections

---

## 4. Team Tab

- [ ] Team members load (Danny, Mikey, Bronson, Sharyn, Jay for FWT)
- [ ] Each row shows: name, role badge, module permission badges (colored), active status
- [ ] Edit: inline form expands with name, email, phone, PIN, role dropdown, module checkboxes
- [ ] Module checkboxes show correct modules with color dots
- [ ] Changing module permissions and saving works
- [ ] Changing role and saving works
- [ ] Active/Inactive toggle works
- [ ] Add new team member: form appears, all fields work, saves correctly
- [ ] Delete team member works (confirm it's removed from the list)

---

## 5. Brand-on-Invoice System

### Invoice Rendering
- [ ] Open a customer-facing invoice (/invoice/[token])
- [ ] Single brand: header shows brand logo (wide preferred) or initials + name
- [ ] Brand's primary_color is used for accent shape and buttons (not hardcoded red)
- [ ] Multi-brand: create a multi-module quote/invoice with services from different brand-assigned modules
- [ ] Multi-brand header shows logos side by side + brand names with dividers
- [ ] Module line item colors come from service_modules.color (not hardcoded MODULE_COLORS)

### Brand Display Settings
- [ ] Set invoice_brand_mode to "fixed" with a specific brand in Checkout settings
- [ ] Create an invoice -- it should show the fixed brand regardless of services
- [ ] Set back to "auto" -- invoice should derive brand from services

### Per-Document Override
- [ ] In Quote Builder, the "Brand Display" section appears when shop has 2+ brands
- [ ] "Shop Default" option works
- [ ] "Auto (from services)" option works
- [ ] "Choose brand(s)" shows checkboxes, saves selected brands

---

## 6. Multi-Service Workflow -- Linked Appointments

### Schedule from Quote
- [ ] Create a multi-module quote (e.g., auto_tint + wraps line items)
- [ ] Approve the quote (Mark Approved button)
- [ ] Schedule button appears next to "Convert to Invoice" on approved quotes
- [ ] Click Schedule -- ScheduleFromQuoteModal opens
- [ ] Modal shows one row per module (grouped from line items)
- [ ] Each row: module color dot + label, duration, date picker, time picker, appointment type
- [ ] Default date is next business day, default time 9:00 AM
- [ ] Sequential toggle (default): second slot auto-calculates start time after first slot's duration
- [ ] Parallel toggle: each slot independently editable
- [ ] "Schedule All" creates the appointments
- [ ] After scheduling, appointments appear on the timeline for the selected date

### Linked Appointment Display
- [ ] Linked appointments show a module badge (colored dot + module name)
- [ ] Linked appointments show a link chain icon with "1 of 2" (or N) text
- [ ] Clicking the link icon expands a preview of sibling slots (module, booking ID, status)
- [ ] "Add Linked Slot" button appears in the linked slots preview
- [ ] Clicking it opens CreateAppointmentModal pre-filled with customer/vehicle/date

### Module Filter
- [ ] When a day has appointments from multiple modules, the module filter dropdown appears
- [ ] Selecting a module filters the timeline to only that module's appointments
- [ ] "All Modules" shows everything

### Per-Slot Status
- [ ] Check In on a tint slot -- only the tint card goes to "in_progress"
- [ ] The linked wrap slot stays at "booked"
- [ ] Complete the tint slot -- tint card goes to "completed"
- [ ] The wrap slot is still independent
- [ ] Message button gating: the "Message" (vehicle_ready) button is disabled/dimmed when not all linked slots are complete
- [ ] Tooltip shows "All linked service slots must be completed first"
- [ ] Complete ALL linked slots -- Message button becomes active
- [ ] Auto-invoice: when all linked slots are completed and linked_invoice_auto_create is on, slots should auto-update to "invoiced"

---

## 7. Manual Appointment Creation

### New Appointment Button
- [ ] Red "New Appointment" button visible in the appointments page nav bar
- [ ] Clicking it opens CreateAppointmentModal
- [ ] Module dropdown shows all enabled modules
- [ ] Customer name, phone, email fields work
- [ ] Vehicle year/make/model fields work
- [ ] Date picker defaults to selected date
- [ ] Time picker works
- [ ] Duration input works (defaults to 60)
- [ ] Appointment type dropdown works
- [ ] Assign To dropdown shows team members filtered by selected module
- [ ] Changing the module updates the Assign To options
- [ ] Notes textarea works
- [ ] Submitting creates the appointment and it appears on the timeline
- [ ] Creating a wraps appointment shows the wraps module badge on the card

### Add Linked Slot (from existing appointment)
- [ ] On any appointment card, click the link icon to expand linked slots
- [ ] Click "Add Linked Slot"
- [ ] Modal opens with customer/vehicle pre-filled and readonly
- [ ] Module dropdown available (can pick a different module than the original)
- [ ] "Adding linked slot to existing appointment group" banner visible
- [ ] Sequential/Parallel toggle appears
- [ ] Submitting creates a new appointment linked to the same group
- [ ] Both appointments now show "1 of 2" link indicators

---

## 8. Team Member Assignment on Appointments

### Assign Dropdown
- [ ] On timeline cards (normal size), a small circular person icon appears
- [ ] Clicking it opens an assign dropdown
- [ ] Dropdown shows team members filtered by the appointment's module
- [ ] Selecting a team member assigns them (name appears on the card)
- [ ] "Unassign" option appears when already assigned
- [ ] Assignment persists on page refresh
- [ ] Compact timeline cards show assigned name as "/ FirstName"

### Team Filter
- [ ] When 2+ team members exist, team filter dropdown appears in nav bar
- [ ] "All Team" shows everything
- [ ] "Unassigned" shows only appointments without an assigned team member
- [ ] Selecting a specific team member shows only their assignments
- [ ] Filter works alongside the module filter (both can be active)

---

## 9. Quote Approval Modes

### Settings
- [ ] Three approval mode cards visible in Checkout settings
- [ ] Each toggleable on/off
- [ ] Default mode dropdown updates based on enabled modes
- [ ] Disabling the current default auto-switches

### Quote Builder -- Sending a Quote
- [ ] Create a quote, click "Send Quote"
- [ ] Send modal shows SMS/Email toggle (unchanged)
- [ ] Approval Mode section appears below (only for quotes, not invoices)
- [ ] Radio buttons for enabled modes
- [ ] Defaults to the shop's default approval mode
- [ ] Schedule + Approve selected: time slot builder appears
- [ ] Can add 2-5 date/time pairs
- [ ] Can remove slots (minimum 1)
- [ ] Sending saves the approval_mode + available_slots on the document

### Customer-Facing -- Just Approve (default/null)
- [ ] Existing "Approve Quote" button works exactly as before
- [ ] No scheduling UI appears

### Customer-Facing -- Schedule + Approve
- [ ] Available time slots appear as selectable cards
- [ ] Date formatted nicely, time shown
- [ ] Must select a slot before "Approve & Book" is enabled
- [ ] Selecting a slot highlights it
- [ ] Clicking "Approve & Book" approves the quote AND creates linked appointments
- [ ] Verify appointments were created on the timeline for the selected date/time

### Customer-Facing -- Approve + Request Dates
- [ ] Date preference form appears (1-3 date inputs)
- [ ] Each date has a time preference dropdown (morning/afternoon/no preference)
- [ ] Can add up to 3 dates, can remove down to 1
- [ ] "Approve Quote" button works
- [ ] After approval, customer_requested_dates is stored on the document
- [ ] No auto-scheduling happens -- team schedules manually
- [ ] In the Quote Builder, the requested dates should be visible on the document detail page

---

## 10. Sidebar Wiring

- [ ] Sidebar reads auto_tint and flat_glass enabled status from shop_modules (not old shop_config booleans)
- [ ] Enabling/disabling auto_tint in Modules tab updates the sidebar AUTOMOTIVE section on refresh
- [ ] Enabling/disabling flat_glass updates the FLAT GLASS sidebar section
- [ ] Platform features (Bookkeeping, Communication, Statistics) still controlled by Shop Info tab toggles
- [ ] Shop name in sidebar header updates when changed in Shop Info

---

## 11. Bookkeeping -- Brands Wiring

- [ ] Open /bookkeeping expense tracker
- [ ] Brand dropdown in the expense form reads from the brands table (FWT, FWG)
- [ ] Not from the old shop_config.brands JSONB
- [ ] Adding a new brand in Brands tab makes it appear in the bookkeeping expense form

---

## 12. Theme System Fix

- [ ] Showroom preset (light theme): card backgrounds are white, input borders are visible (darkened, not white-on-white)
- [ ] General page border is visible on light themes
- [ ] Hover states work on light themes (darken instead of lighten)
- [ ] All dark presets: input borders have adequate contrast (not too subtle)
- [ ] Switch between 3-4 different presets rapidly -- no visual glitches, borders always visible

---

## 13. Cross-Cutting Checks

- [ ] No hardcoded "Frederick Window Tinting" anywhere in the UI
- [ ] No emojis anywhere
- [ ] All pages return 200 (no crashes)
- [ ] PDF download on invoices still works
- [ ] Stripe payment flow on invoices still works
- [ ] Self-checkout page still works
- [ ] Booking page (/book) still works for auto tint
- [ ] Command Center (/) still loads with correct metrics
- [ ] Quick Tint Quote still works
- [ ] Lead Pipeline still works

---

## Notes / Issues Found

Use this space to log anything that needs fixing:

| # | Issue | Section | Severity | Status |
|---|-------|---------|----------|--------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |
