// ============================================================================
// POST /api/documents/[id]/approve
// Customer approves a quote. Optionally converts it to an invoice.
// For options mode: only keeps the selected option's line items, deletes the rest.
// Supports three approval modes:
//   - just_approve (default): approve + convert to invoice
//   - schedule_approve: approve + auto-create appointment from selected slot
// Public endpoint — uses the document's public_token for auth.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { randomUUID } from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const body = await request.json();
    const { convertToInvoice = false, selectedOptionGroupId, selectedSlot } = body;

    // Fetch the document with its line items
    const { data: doc, error } = await supabaseAdmin
      .from('documents')
      .select('id, status, doc_type, shop_id, options_mode, approval_mode, subtotal, discount_amount, deposit_paid, total_paid, balance_due, customer_id, customer_name, customer_email, customer_phone, vehicle_year, vehicle_make, vehicle_model, class_keys')
      .eq('id', documentId)
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (doc.doc_type !== 'quote') {
      return NextResponse.json({ error: 'Only quotes can be approved' }, { status: 400 });
    }
    if (!['sent', 'viewed', 'approved'].includes(doc.status)) {
      return NextResponse.json({ error: 'Quote cannot be approved in current status' }, { status: 400 });
    }

    const approvalMode = doc.approval_mode || 'just_approve';

    // OPTIONS MODE: if a specific option was selected, keep only those line items
    if (doc.options_mode && selectedOptionGroupId) {
      // Delete all line items NOT in the selected group
      const { data: allItems } = await supabaseAdmin
        .from('document_line_items')
        .select('id, group_id, line_total')
        .eq('document_id', documentId);

      const itemsToDelete = (allItems || []).filter(li => li.group_id !== selectedOptionGroupId);
      const itemsToKeep = (allItems || []).filter(li => li.group_id === selectedOptionGroupId);

      if (itemsToDelete.length > 0) {
        await supabaseAdmin
          .from('document_line_items')
          .delete()
          .in('id', itemsToDelete.map(li => li.id));
      }

      // Recalculate subtotal from kept items only
      const newSubtotal = itemsToKeep.reduce((sum, li) => sum + (Number(li.line_total) || 0), 0);

      const updates: Record<string, unknown> = {
        status: 'approved',
        approved_at: new Date().toISOString(),
        subtotal: newSubtotal,
        options_mode: false, // Turn off options mode after selection
      };

      if (convertToInvoice) {
        const { data: docNumber } = await supabaseAdmin
          .rpc('generate_document_number', { p_shop_id: doc.shop_id, p_doc_type: 'invoice' });

        updates.doc_type = 'invoice';
        updates.doc_number = docNumber;
        updates.balance_due = newSubtotal - (Number(doc.discount_amount) || 0) - (Number(doc.total_paid) || 0);
      } else {
        updates.balance_due = newSubtotal - (Number(doc.discount_amount) || 0) - (Number(doc.total_paid) || 0);
      }


      const { data: updated, error: updateError } = await supabaseAdmin
        .from('documents')
        .update(updates)
        .eq('id', documentId)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      // schedule_approve with options: auto-create appointment after approval
      let appointmentResult = null;
      if (approvalMode === 'schedule_approve' && selectedSlot) {
        appointmentResult = await createAppointmentsFromSlot(documentId, doc, selectedSlot);
      }

      return NextResponse.json({
        success: true,
        document: updated,
        converted: convertToInvoice,
        selectedOption: selectedOptionGroupId,
        removedItems: itemsToDelete.length,
        appointment: appointmentResult,
      });
    }

    // STANDARD MODE (non-options): approve the whole document
    const updates: Record<string, unknown> = {
      status: 'approved',
      approved_at: new Date().toISOString(),
    };

    if (convertToInvoice) {
      const { data: docNumber } = await supabaseAdmin
        .rpc('generate_document_number', { p_shop_id: doc.shop_id, p_doc_type: 'invoice' });

      updates.doc_type = 'invoice';
      updates.doc_number = docNumber;
      updates.balance_due = (Number(doc.subtotal) || 0) - (Number(doc.discount_amount) || 0) - (Number(doc.total_paid) || 0);
    }


    const { data: updated, error: updateError } = await supabaseAdmin
      .from('documents')
      .update(updates)
      .eq('id', documentId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // schedule_approve mode: auto-create appointments from the selected slot
    let appointmentResult = null;
    if (approvalMode === 'schedule_approve' && selectedSlot) {
      appointmentResult = await createAppointmentsFromSlot(documentId, doc, selectedSlot);
    }

    return NextResponse.json({
      success: true,
      document: updated,
      converted: convertToInvoice,
      appointment: appointmentResult,
    });
  } catch (err) {
    console.error('Quote approval error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================================
// Helper: create appointments from a selected slot (schedule_approve mode)
// Groups line items by module, creates one appointment per module (linked if multiple)
// ============================================================================
async function createAppointmentsFromSlot(
  documentId: string,
  doc: Record<string, unknown>,
  selectedSlot: { date: string; time: string },
): Promise<{ linkedGroupId: string | null; slots: Array<Record<string, unknown>> } | null> {
  try {
    // Cancel any existing appointments from a previous approval of this document
    const { data: existingAppts } = await supabaseAdmin
      .from('auto_bookings')
      .select('id')
      .eq('document_id', documentId)
      .neq('status', 'cancelled');

    if (existingAppts && existingAppts.length > 0) {
      await supabaseAdmin
        .from('auto_bookings')
        .update({ status: 'cancelled' })
        .in('id', existingAppts.map(a => a.id));
    }

    // Fetch line items
    const { data: lineItems } = await supabaseAdmin
      .from('document_line_items')
      .select('module, description, quantity, unit_price, line_total, custom_fields')
      .eq('document_id', documentId);

    if (!lineItems || lineItems.length === 0) return null;

    // Group by module
    const lineItemsByModule: Record<string, typeof lineItems> = {};
    for (const item of lineItems) {
      const mod = item.module || 'auto_tint';
      if (!lineItemsByModule[mod]) lineItemsByModule[mod] = [];
      lineItemsByModule[mod].push(item);
    }

    const moduleKeys = Object.keys(lineItemsByModule);
    const linkedGroupId = moduleKeys.length > 1 ? randomUUID() : null;
    const createdSlots: Array<Record<string, unknown>> = [];

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

    for (const moduleKey of moduleKeys) {
      const moduleItems = lineItemsByModule[moduleKey];

      // Generate booking ID
      const { data: bookingIdResult } = await supabaseAdmin.rpc('generate_auto_booking_id');
      const bookingId = bookingIdResult || `${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-000`;

      // Build services_json
      const servicesJson = moduleItems.map(item => ({
        label: item.description,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        lineTotal: item.line_total,
        ...(item.custom_fields || {}),
      }));

      const moduleSubtotal = moduleItems.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0);

      const { data: booking, error: bookingError } = await supabaseAdmin
        .from('auto_bookings')
        .insert({
          shop_id: doc.shop_id,
          booking_id: bookingId,
          customer_id: doc.customer_id || null,
          booking_source: 'online',
          appointment_type: 'dropoff',
          service_type: moduleToServiceType[moduleKey] || 'tint',
          module: moduleKey,
          linked_group_id: linkedGroupId,
          document_id: documentId,
          scheduling_mode: 'sequential',
          customer_name: doc.customer_name || '',
          customer_email: doc.customer_email || null,
          customer_phone: doc.customer_phone || null,
          vehicle_year: doc.vehicle_year || null,
          vehicle_make: doc.vehicle_make || null,
          vehicle_model: doc.vehicle_model || null,
          class_keys: doc.class_keys || null,
          appointment_date: selectedSlot.date,
          appointment_time: selectedSlot.time || null,
          duration_minutes: 60, // Default; team can adjust
          services_json: servicesJson,
          subtotal: moduleSubtotal,
          deposit_paid: 0,
          balance_due: moduleSubtotal,
          status: 'booked',
          notes: moduleKeys.length > 1 ? `Linked: ${moduleKeys.join(' + ')}` : null,
        })
        .select()
        .single();

      if (bookingError) {
        console.error('Appointment creation error:', bookingError);
        continue;
      }

      createdSlots.push(booking);
    }

    // Link first appointment back to the document
    if (createdSlots.length > 0) {
      await supabaseAdmin
        .from('documents')
        .update({ booking_id: createdSlots[0].id as string })
        .eq('id', documentId);
    }

    return { linkedGroupId, slots: createdSlots };
  } catch (err) {
    console.error('Auto-schedule from approval error:', err);
    return null;
  }
}
