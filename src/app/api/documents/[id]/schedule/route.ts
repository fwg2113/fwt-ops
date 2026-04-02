import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';
import { randomUUID } from 'crypto';

// POST /api/documents/[id]/schedule
// Creates linked appointment slots from an approved document's line items
// Groups line items by module, creates one appointment per module
// Body: { slots: [{ module, date, time, duration_minutes, appointment_type }], scheduling_mode? }
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const url = new URL(req.url);
    const documentId = url.pathname.split('/').slice(-2, -1)[0];

    const body = await req.json();
    const { slots, scheduling_mode } = body as {
      slots: Array<{
        module: string;
        date: string;
        time: string | null;
        duration_minutes: number;
        appointment_type: string;
      }>;
      scheduling_mode?: 'sequential' | 'parallel';
    };

    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      return NextResponse.json({ error: 'slots array is required' }, { status: 400 });
    }

    // Fetch the document with line items
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*, document_line_items(*)')
      .eq('id', documentId)
      .eq('shop_id', shopId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Verify document is approved or in a schedulable state
    if (!['approved', 'in_progress', 'draft'].includes(doc.status)) {
      return NextResponse.json({ error: `Cannot schedule from a document with status "${doc.status}"` }, { status: 400 });
    }

    // Check that we haven't already scheduled from this document
    const { data: existingSlots } = await supabase
      .from('auto_bookings')
      .select('id, module')
      .eq('document_id', documentId)
      .neq('status', 'cancelled');

    if (existingSlots && existingSlots.length > 0) {
      return NextResponse.json({
        error: 'Appointments already exist for this document',
        existing: existingSlots,
      }, { status: 409 });
    }

    // Generate a shared linked_group_id for all slots (only if multiple)
    const linkedGroupId = slots.length > 1 ? randomUUID() : null;

    // Group line items by module for services_json
    const lineItems = (doc.document_line_items || []) as Array<{
      module: string;
      description: string;
      quantity: number;
      unit_price: number;
      line_total: number;
      custom_fields: Record<string, unknown>;
    }>;

    const lineItemsByModule: Record<string, typeof lineItems> = {};
    for (const item of lineItems) {
      const mod = item.module || 'auto_tint';
      if (!lineItemsByModule[mod]) lineItemsByModule[mod] = [];
      lineItemsByModule[mod].push(item);
    }

    // Map module keys to legacy service_type values for the CHECK constraint
    const moduleToServiceType: Record<string, string> = {
      auto_tint: 'tint',
      auto_removal: 'removal',
      auto_alacarte: 'alacarte',
      flat_glass: 'flat_glass',
      detailing: 'detailing',
      ceramic_coating: 'ceramic_coating',
      ppf: 'ppf',
      wraps: 'wraps',
    };

    // Create appointment slots
    const createdSlots: Array<Record<string, unknown>> = [];

    for (const slot of slots) {
      // Generate booking ID
      const { data: bookingIdResult } = await supabase.rpc('generate_auto_booking_id');
      const bookingId = bookingIdResult || `${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-000`;

      // Build services_json from the module's line items
      const moduleItems = lineItemsByModule[slot.module] || [];
      const servicesJson = moduleItems.map(item => ({
        label: item.description,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        lineTotal: item.line_total,
        ...(item.custom_fields || {}),
      }));

      // Calculate subtotal for this module's items
      const moduleSubtotal = moduleItems.reduce((sum, item) => sum + (item.line_total || 0), 0);

      const { data: booking, error: bookingError } = await supabase
        .from('auto_bookings')
        .insert({
          shop_id: shopId,
          booking_id: bookingId,
          customer_id: doc.customer_id || null,
          booking_source: 'internal',
          appointment_type: slot.appointment_type || 'dropoff',
          service_type: moduleToServiceType[slot.module] || 'tint',
          module: slot.module,
          linked_group_id: linkedGroupId,
          document_id: documentId,
          scheduling_mode: scheduling_mode || 'sequential',
          customer_name: doc.customer_name || '',
          customer_email: doc.customer_email || null,
          customer_phone: doc.customer_phone || null,
          vehicle_year: doc.vehicle_year || null,
          vehicle_make: doc.vehicle_make || null,
          vehicle_model: doc.vehicle_model || null,
          class_keys: doc.class_keys || null,
          appointment_date: slot.date,
          appointment_time: slot.time || null,
          duration_minutes: slot.duration_minutes,
          services_json: servicesJson,
          subtotal: moduleSubtotal,
          deposit_paid: 0,
          balance_due: moduleSubtotal,
          status: 'booked',
          notes: slots.length > 1 ? `Linked: ${slots.map(s => s.module).join(' + ')}` : null,
        })
        .select()
        .single();

      if (bookingError) {
        console.error('Slot creation error:', bookingError);
        return NextResponse.json({ error: `Failed to create ${slot.module} slot: ${bookingError.message}` }, { status: 500 });
      }

      createdSlots.push(booking);
    }

    // Update document to link back (set booking_id to the first slot for backwards compat)
    if (createdSlots.length > 0) {
      await supabase
        .from('documents')
        .update({ booking_id: createdSlots[0].id as string })
        .eq('id', documentId);
    }

    return NextResponse.json({
      success: true,
      linkedGroupId,
      slots: createdSlots,
    });
  } catch (error) {
    console.error('Schedule from quote error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
