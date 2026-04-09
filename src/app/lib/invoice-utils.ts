// ============================================================================
// INVOICE/DOCUMENT CREATION UTILITY
// Creates documents + normalized line items in the new tables.
// Extracted so it can be called from:
// - POST /api/documents (manual creation)
// - PATCH /api/auto/appointments (auto-create hooks)
// - POST /api/auto/checkout/self (self-checkout on-demand)
// ============================================================================

import { supabaseAdmin } from '@/app/lib/supabase-server';

type ServiceItem = {
  label?: string;
  filmName?: string;
  filmAbbrev?: string;
  filmId?: number;
  shade?: string;
  shadeFront?: string;
  shadeRear?: string;
  shadeId?: number;
  price?: number;
  quantity?: number;
  discountAmount?: number;
  duration?: number;
  serviceKey?: string;
  module?: string;
  [key: string]: unknown;
};

export interface DocumentResult {
  id: string;
  public_token: string;
  doc_number: string;
}

/**
 * Creates an invoice document from a booking ID. Idempotent — returns existing if one exists.
 * Creates normalized document_line_items rows (one per service).
 * Auto-applies Roll IDs from active inventory for tint line items.
 * Snapshots warranty content from shop_config.
 * Updates booking status to 'invoiced'.
 */
export async function createDocumentFromBooking(
  bookingId: string,
  checkoutType: 'counter' | 'remote' | 'self_checkout' = 'counter',
  shopId: number = 1
): Promise<{ document: DocumentResult; existing: boolean } | { error: string }> {
  // Fetch the appointment
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('auto_bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('shop_id', shopId)
    .single();

  if (bookingError || !booking) {
    return { error: 'Appointment not found' };
  }

  // Check if document already exists for this booking
  const { data: existingDoc } = await supabaseAdmin
    .from('documents')
    .select('id, public_token, doc_number')
    .eq('booking_id', bookingId)
    .eq('shop_id', shopId)
    .single();

  if (existingDoc) {
    // Re-sync line items from current booking data (services/shades may have been edited)
    const currentServices: ServiceItem[] = Array.isArray(booking.services_json) ? booking.services_json : [];
    if (currentServices.length > 0) {
      const refreshedServices = await applyRollIds(currentServices, shopId);

      // Delete old line items and re-create from current data
      await supabaseAdmin
        .from('document_line_items')
        .delete()
        .eq('document_id', existingDoc.id);

      const refreshedRows = refreshedServices.map((svc, idx) => ({
        document_id: existingDoc.id,
        module: svc.module || 'auto_tint',
        description: svc.label || '',
        quantity: 1,
        unit_price: svc.price || 0,
        line_total: svc.price || 0,
        sort_order: idx,
        custom_fields: buildCustomFields(svc),
      }));

      await supabaseAdmin
        .from('document_line_items')
        .insert(refreshedRows);

      // Update document: totals, convert quote to invoice, set checkout type.
      // Generate a NEW doc_number ONLY if the existing one is still a quote
      // number (Q- prefix). If the doc was already an invoice (any "INV-"
      // prefix, including historic backfill INV-260401-006), keep its existing
      // number — never regenerate, otherwise re-clicking "Invoice" would
      // overwrite a stable number with a fresh sequential one.
      const wasQuote = (existingDoc.doc_number || '').startsWith('Q-');
      let nextDocNumber = existingDoc.doc_number;
      if (wasQuote) {
        const { data: rpcDocNumber } = await supabaseAdmin
          .rpc('generate_document_number', { p_shop_id: shopId, p_doc_type: 'invoice' });
        nextDocNumber = rpcDocNumber || existingDoc.doc_number;
      }

      const startingTotal = booking.starting_total_override ?? booking.subtotal;
      const upsellAmount = Math.max(0, booking.subtotal - startingTotal);
      // Recompute balance_due from the booking's authoritative components
      // (subtotal − discount − deposit) instead of trusting booking.balance_due.
      const recomputedBalance = Math.max(0, (Number(booking.subtotal) || 0)
        - (Number(booking.discount_amount) || 0)
        - (Number(booking.deposit_paid) || 0));
      await supabaseAdmin
        .from('documents')
        .update({
          doc_type: 'invoice',
          doc_number: nextDocNumber,
          checkout_type: checkoutType,
          subtotal: booking.subtotal,
          starting_total: startingTotal,
          upsell_amount: upsellAmount,
          discount_amount: booking.discount_amount,
          deposit_paid: booking.deposit_paid,
          balance_due: recomputedBalance,
          // Don't reset status to 'draft' — only set it if this was actually
          // a quote being converted to an invoice. Otherwise leave the existing
          // status alone (could be 'paid', 'partial', 'sent', etc.).
          ...(wasQuote ? { status: 'draft' as const } : {}),
        })
        .eq('id', existingDoc.id);
    }

    // Make sure the bidirectional link is set even on the existing-doc path,
    // in case it was missing (e.g. quote created before this fix).
    await supabaseAdmin
      .from('auto_bookings')
      .update({ document_id: existingDoc.id })
      .eq('id', bookingId);

    return { document: existingDoc, existing: true };
  }

  // Fetch shop config for CC fee rates + warranty content
  const { data: shopConfig } = await supabaseAdmin
    .from('shop_config')
    .select('cc_fee_percent, cc_fee_flat, cash_discount_percent, module_invoice_content')
    .eq('id', shopId)
    .single();

  // Parse services and determine which modules are present
  const services: ServiceItem[] = Array.isArray(booking.services_json) ? booking.services_json : [];
  const presentModules = [...new Set(services.map(s => s.module || 'auto_tint'))];

  // Build warranty content snapshot (only modules present on this invoice)
  const moduleInvoiceContent = shopConfig?.module_invoice_content || {};
  const warrantySnapshot: Record<string, unknown> = {};
  for (const mod of presentModules) {
    if (moduleInvoiceContent[mod]) {
      warrantySnapshot[mod] = moduleInvoiceContent[mod];
    }
  }

  // Generate document number — for historic backfill rows, reuse the
  // booking_id (e.g. "260401-001") as the doc number so it matches the
  // legacy spreadsheet's InvoiceNum. For live rows, use the auto-generated
  // sequential number from the RPC.
  const isHistoric = booking.import_source === 'historic_import';
  let docNumber: string | null = null;
  if (isHistoric && booking.booking_id) {
    docNumber = `INV-${booking.booking_id}`;
  } else {
    const { data: rpcDocNumber } = await supabaseAdmin
      .rpc('generate_document_number', { p_shop_id: shopId, p_doc_type: 'invoice' });
    docNumber = rpcDocNumber;
  }

  // For historic backfill, backdate created_at to the appointment date so
  // the document filters correctly under the historic month, not "today."
  // Use 17:00 UTC (1pm EDT / noon EST) so any continental US local-time month
  // filter classifies it under the correct calendar month.
  const historicCreatedAt = (isHistoric && booking.appointment_date)
    ? `${booking.appointment_date}T17:00:00+00:00`
    : null;

  // Create the document.
  // total_paid is seeded with the deposit_paid amount so the running total
  // already reflects money the customer has paid. When counter payments come
  // in via /api/documents/[id]/payments, they add on top of this base, giving
  // total_paid = deposit + counter payments = customer's all-in payment.
  // Without this seeding, deposits silently disappear from the "total paid"
  // displayed on the invoice, the customer profile, and the bookkeeping ledger.
  const document: Record<string, unknown> = {
    shop_id: shopId,
    doc_type: 'invoice' as const,
    doc_number: docNumber || `INV-${Date.now()}`,
    booking_id: booking.id,
    customer_id: booking.customer_id || null,
    customer_name: booking.customer_name,
    customer_email: booking.customer_email,
    customer_phone: booking.customer_phone,
    vehicle_year: booking.vehicle_year,
    vehicle_make: booking.vehicle_make,
    vehicle_model: booking.vehicle_model,
    class_keys: booking.class_keys,
    subtotal: booking.subtotal,
    starting_total: booking.starting_total_override ?? booking.subtotal,
    upsell_amount: 0, // No upsell at creation; recalcs as line items change
    discount_code: booking.discount_code,
    discount_type: booking.discount_type,
    discount_percent: booking.discount_percent,
    discount_amount: booking.discount_amount,
    deposit_paid: booking.deposit_paid,
    total_paid: booking.deposit_paid || 0, // seed with deposit so payments accumulate correctly
    cc_fee_percent: shopConfig?.cc_fee_percent || 3.5,
    cc_fee_flat: shopConfig?.cc_fee_flat || 0.30,
    cash_discount_percent: shopConfig?.cash_discount_percent || 5.0,
    // Always recompute balance_due from subtotal − discount − deposit instead
    // of trusting booking.balance_due, which may be stale or wrong (e.g. when
    // a discount was applied at booking time but the booking row didn't fold
    // it into balance_due, like a GC redemption that wasn't subtracted).
    balance_due: Math.max(0, (Number(booking.subtotal) || 0)
      - (Number(booking.discount_amount) || 0)
      - (Number(booking.deposit_paid) || 0)),
    status: 'draft',
    checkout_type: checkoutType,
    warranty_content_snapshot: Object.keys(warrantySnapshot).length > 0 ? warrantySnapshot : null,
    import_source: isHistoric ? 'historic_import' : null,
  };
  if (historicCreatedAt) {
    document.created_at = historicCreatedAt;
  }

  const { data: created, error: insertError } = await supabaseAdmin
    .from('documents')
    .insert(document)
    .select('id, public_token, doc_number')
    .single();

  if (insertError || !created) {
    console.error('Document insert error:', insertError);
    return { error: 'Failed to create document' };
  }

  // Create normalized line items with Roll IDs auto-applied
  const lineItemsWithRolls = await applyRollIds(services, shopId);

  const lineItemRows = lineItemsWithRolls.map((svc, idx) => ({
    document_id: created.id,
    module: svc.module || 'auto_tint',
    description: svc.label || '',
    quantity: 1,
    unit_price: svc.price || 0,
    line_total: svc.price || 0,
    sort_order: idx,
    custom_fields: buildCustomFields(svc),
  }));

  if (lineItemRows.length > 0) {
    const { error: lineError } = await supabaseAdmin
      .from('document_line_items')
      .insert(lineItemRows);

    if (lineError) {
      console.error('Line items insert error:', lineError);
      // Document was created but line items failed — log but don't fail
    }
  }

  // Update the booking status to 'invoiced' AND set the bidirectional link
  // (auto_bookings.document_id → documents.id) so the payment route can find
  // the booking by document_id when payment is recorded.
  await supabaseAdmin
    .from('auto_bookings')
    .update({ status: 'invoiced', document_id: created.id })
    .eq('id', bookingId);

  return { document: created, existing: false };
}

// Legacy alias for backwards compatibility during transition
export const createInvoiceFromBooking = createDocumentFromBooking;

// ============================================================================
// CREATE QUOTE FOR APPOINTMENT
// Creates a quote document + line items at the same time as a booking.
// Used by all appointment creation paths (Quick Tint Quote, online booking,
// CreateAppointmentModal) so every appointment has a backing document.
// The quote is auto-approved since the shop already confirmed the work.
// Returns the document ID to be set as document_id on the auto_bookings row.
// ============================================================================

export interface CreateQuoteInput {
  shopId: number;
  customerId: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  classKeys: string | null;
  services: ServiceItem[];
  subtotal: number;
  discountCode?: string | null;
  discountType?: string | null;
  discountPercent?: number;
  discountAmount?: number;
  depositPaid?: number;
  balanceDue: number;
  module?: string;
  bookingId?: string; // auto_bookings.id to link back
  notes?: string | null;
}

export async function createQuoteForAppointment(
  input: CreateQuoteInput,
): Promise<{ documentId: string; docNumber: string } | null> {
  try {
    // Generate document number as a quote
    const { data: docNumber } = await supabaseAdmin
      .rpc('generate_document_number', { p_shop_id: input.shopId, p_doc_type: 'quote' });

    // Create the document as an auto-approved quote
    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({
        shop_id: input.shopId,
        doc_type: 'quote',
        doc_number: docNumber || `Q-${Date.now()}`,
        booking_id: input.bookingId || null,
        customer_id: input.customerId,
        customer_name: input.customerName,
        customer_email: input.customerEmail,
        customer_phone: input.customerPhone,
        vehicle_year: input.vehicleYear,
        vehicle_make: input.vehicleMake,
        vehicle_model: input.vehicleModel,
        class_keys: input.classKeys,
        subtotal: input.subtotal,
        starting_total: input.subtotal,
        discount_code: input.discountCode || null,
        discount_type: input.discountType || null,
        discount_percent: input.discountPercent || 0,
        discount_amount: input.discountAmount || 0,
        deposit_paid: input.depositPaid || 0,
        balance_due: input.balanceDue,
        status: 'approved',
        approved_at: new Date().toISOString(),
        checkout_type: 'counter',
        notes: input.notes || null,
      })
      .select('id, doc_number')
      .single();

    if (docError || !doc) {
      console.error('createQuoteForAppointment: document insert error:', docError);
      return null;
    }

    // Create line items from services
    if (input.services.length > 0) {
      const lineItemRows = input.services.map((svc, idx) => ({
        document_id: doc.id,
        module: svc.module || input.module || 'auto_tint',
        description: svc.label || '',
        quantity: svc.quantity || 1,
        unit_price: svc.price || 0,
        line_total: (svc.price || 0) * (svc.quantity || 1),
        sort_order: idx,
        custom_fields: buildCustomFields(svc),
      }));

      const { error: lineError } = await supabaseAdmin
        .from('document_line_items')
        .insert(lineItemRows);

      if (lineError) {
        console.error('createQuoteForAppointment: line items insert error:', lineError);
      }
    }

    return { documentId: doc.id, docNumber: doc.doc_number };
  } catch (err) {
    console.error('createQuoteForAppointment error:', err);
    return null;
  }
}

// ============================================================================
// Build custom_fields JSONB from a service item
// Strips null values to keep the JSONB clean
// ============================================================================
function buildCustomFields(svc: ServiceItem): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (svc.filmId != null) fields.filmId = svc.filmId;
  if (svc.filmName) fields.filmName = svc.filmName;
  if (svc.filmAbbrev) fields.filmAbbrev = svc.filmAbbrev;
  if (svc.shadeId != null) fields.shadeId = svc.shadeId;
  if (svc.shade) fields.shade = svc.shade;
  if (svc.shadeFront) fields.shadeFront = svc.shadeFront;
  if (svc.shadeRear) fields.shadeRear = svc.shadeRear;
  if (svc.serviceKey) fields.serviceKey = svc.serviceKey;
  if (svc.discountAmount) fields.discountAmount = svc.discountAmount;
  if (svc.duration) fields.duration = svc.duration;
  if (svc.rollId) fields.rollId = svc.rollId;
  if (svc.rollInventoryId) fields.rollInventoryId = svc.rollInventoryId;
  if (svc.warrantyYears) fields.warrantyYears = svc.warrantyYears;

  return fields;
}

// ============================================================================
// Roll ID auto-application
// Looks up active rolls for tint line items and adds rollId/rollInventoryId
// ============================================================================
async function applyRollIds(services: ServiceItem[], shopId: number): Promise<ServiceItem[]> {
  if (!services.length) return services;

  // Collect film IDs that need roll lookup
  const filmIds = new Set<number>();
  for (const svc of services) {
    if (svc.filmId) filmIds.add(svc.filmId);
  }
  if (!filmIds.size) return services;

  // Fetch shade records for all referenced films (needed for string-to-ID resolution)
  const { data: allShades } = await supabaseAdmin
    .from('auto_film_shades')
    .select('id, film_id, shade_value')
    .in('film_id', [...filmIds]);

  const shadeMap = new Map<string, number>();
  if (allShades) {
    for (const s of allShades) {
      shadeMap.set(`${s.film_id}-${s.shade_value}`, s.id);
    }
  }

  // Known fixed-shade defaults for services that always use a specific shade
  const FIXED_SHADE_DEFAULTS: Record<string, string> = {
    SUN_STRIP: '5%',
  };

  // Build lookups with resolved shade IDs
  const lookups: { filmId: number; shadeId: number; index: number }[] = [];
  for (let i = 0; i < services.length; i++) {
    const svc = services[i];
    if (!svc.filmId) continue;

    let shadeId = svc.shadeId;

    // Resolve shade string to ID if needed
    if (!shadeId) {
      let shadeStr = svc.shadeFront || svc.shade;

      // Fall back to fixed default for known services (e.g., SUN_STRIP = 5%)
      if (!shadeStr && svc.serviceKey && FIXED_SHADE_DEFAULTS[svc.serviceKey]) {
        shadeStr = FIXED_SHADE_DEFAULTS[svc.serviceKey];
      }

      if (shadeStr) {
        shadeId = shadeMap.get(`${svc.filmId}-${shadeStr}`);
      }
    }

    if (shadeId) {
      lookups.push({ filmId: svc.filmId, shadeId, index: i });
    }
  }

  if (!lookups.length) return services;

  const shadeIds = [...new Set(lookups.map(l => l.shadeId))];

  const { data: activeRolls } = await supabaseAdmin
    .from('auto_roll_inventory')
    .select('id, film_id, shade_id, roll_id')
    .in('film_id', [...filmIds])
    .in('shade_id', shadeIds)
    .eq('is_active', true)
    .eq('shop_id', shopId);

  const rollMap = new Map<string, { rollId: string; rollInventoryId: number }>();
  if (activeRolls) {
    for (const roll of activeRolls) {
      rollMap.set(`${roll.film_id}-${roll.shade_id}`, {
        rollId: roll.roll_id,
        rollInventoryId: roll.id,
      });
    }
  }

  return services.map((svc, i) => {
    const lookup = lookups.find(l => l.index === i);
    if (!lookup) return svc;
    const roll = rollMap.get(`${lookup.filmId}-${lookup.shadeId}`);
    return {
      ...svc,
      shadeId: lookup.shadeId, // Persist the resolved shade ID
      rollId: roll?.rollId || null,
      rollInventoryId: roll?.rollInventoryId || null,
    };
  });
}
