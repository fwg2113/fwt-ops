// ============================================================================
// DOCUMENT API — LIST + CREATE
// Replaces /api/auto/invoices for the new normalized document system.
// ============================================================================

import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';
import { createDocumentFromBooking } from '@/app/lib/invoice-utils';

// GET /api/documents — list documents with optional filters
export const GET = withShopAuth(async ({ shopId, req }) => {
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const docType = url.searchParams.get('doc_type');
  const bookingId = url.searchParams.get('bookingId');
  const id = url.searchParams.get('id');

  const supabase = getAdminClient();

  let query = supabase
    .from('documents')
    .select('*, document_line_items(*)')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });

  if (id) query = query.eq('id', id);
  if (status) query = query.eq('status', status);
  if (docType) query = query.eq('doc_type', docType);
  if (bookingId) query = query.eq('booking_id', bookingId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Compose line items into a flat array for backward compat with dashboard
  const documents = (data || []).map((doc: any) => ({
    ...doc,
    // Provide line_items_json-like array for components that expect it
    line_items: doc.document_line_items || [],
  }));

  return NextResponse.json(documents);
});

// POST /api/documents — create document from booking or manually
export const POST = withShopAuth(async ({ shopId, req }) => {
  const body = await req.json();
  const { bookingId, checkoutType = 'counter' } = body;

  if (bookingId) {
    const result = await createDocumentFromBooking(bookingId, checkoutType, shopId);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ...result.document,
      existing: result.existing,
    });
  }

  // Manual document creation (no booking)
  const supabase = getAdminClient();

  // Auto-create customer if name + phone provided but no customer_id
  let customerId = body.customer_id || null;
  if (!customerId && body.customer_phone) {
    const cleanPhone = body.customer_phone.replace(/\D/g, '');
    if (cleanPhone) {
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', cleanPhone)
        .eq('shop_id', shopId)
        .single();

      if (existing) {
        customerId = existing.id;
        // Update name/email if provided
        const updates: Record<string, string> = {};
        if (body.customer_name) {
          const parts = body.customer_name.trim().split(' ');
          updates.first_name = parts[0] || '';
          updates.last_name = parts.slice(1).join(' ') || '';
        }
        if (body.customer_email) updates.email = body.customer_email;
        if (Object.keys(updates).length > 0) {
          await supabase.from('customers').update(updates).eq('id', customerId);
        }
      } else {
        const parts = (body.customer_name || '').trim().split(' ');
        const { data: newCust } = await supabase
          .from('customers')
          .insert({
            shop_id: shopId,
            phone: cleanPhone,
            first_name: parts[0] || '',
            last_name: parts.slice(1).join(' ') || '',
            email: body.customer_email || null,
          })
          .select('id')
          .single();
        customerId = newCust?.id || null;
      }
    }
  }

  const { data: docNumber } = await supabase
    .rpc('generate_document_number', {
      p_shop_id: shopId,
      p_doc_type: body.doc_type || 'invoice',
    });

  const doc = {
    shop_id: shopId,
    doc_type: body.doc_type || 'invoice',
    doc_number: docNumber,
    customer_id: customerId,
    customer_name: body.customer_name || '',
    customer_email: body.customer_email || null,
    customer_phone: body.customer_phone || null,
    vehicle_year: body.vehicle_year || null,
    vehicle_make: body.vehicle_make || null,
    vehicle_model: body.vehicle_model || null,
    class_keys: body.class_keys || null,
    subtotal: body.subtotal || 0,
    balance_due: body.balance_due || 0,
    status: 'draft',
    checkout_type: body.checkout_type || 'counter',
    notes: body.notes || null,
  };

  const { data: created, error } = await supabase
    .from('documents')
    .insert(doc)
    .select('id, public_token, doc_number')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(created);
});

// PATCH /api/documents — update document by id
export const PATCH = withShopAuth(async ({ shopId, req }) => {
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', id)
    .eq('shop_id', shopId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
});
