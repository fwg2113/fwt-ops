import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';
import { createDocumentFromBooking } from '@/app/lib/invoice-utils';

// ============================================================================
// POST /api/auto/invoices
// Creates a document (invoice) from an appointment ID.
// Now writes to the documents + document_line_items tables.
// ============================================================================
export const POST = withShopAuth(async ({ req }) => {
  try {
    const { bookingId, checkoutType } = await req.json();

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
    }

    const result = await createDocumentFromBooking(bookingId, checkoutType || 'counter');

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    // Return in the old format for backward compat with existing callers
    return NextResponse.json({
      invoice: {
        id: result.document.id,
        public_token: result.document.public_token,
        invoice_number: result.document.doc_number,
      },
      existing: result.existing,
    });
  } catch (error) {
    console.error('Invoice creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// ============================================================================
// GET /api/auto/invoices — list/fetch from documents table
// Composes line_items_json from normalized line items for backward compat
// ============================================================================
export const GET = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const bookingId = searchParams.get('bookingId');
    const id = searchParams.get('id');

    if (id) {
      const { data, error } = await supabase
        .from('documents')
        .select('*, document_line_items(*)')
        .eq('id', id)
        .eq('shop_id', shopId)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }
      return NextResponse.json({ invoice: composeDocument(data) });
    }

    if (bookingId) {
      const { data, error } = await supabase
        .from('documents')
        .select('*, document_line_items(*)')
        .eq('booking_id', bookingId)
        .eq('shop_id', shopId)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }
      return NextResponse.json({ invoice: composeDocument(data) });
    }

    let query = supabase
      .from('documents')
      .select('*, document_line_items(*)')
      .eq('shop_id', shopId)
      .eq('doc_type', 'invoice')
      .order('created_at', { ascending: false })
      .limit(100);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Invoice list error:', error);
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }

    return NextResponse.json({ invoices: (data || []).map(composeDocument) });
  } catch (error) {
    console.error('Invoice fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// ============================================================================
// PATCH /api/auto/invoices — update document fields
// ============================================================================
export const PATCH = withShopAuth(async ({ shopId, req }) => {
  try {
    const supabase = getAdminClient();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Strip fields that don't exist on documents table
    const { line_items_json, invoice_number, ...validUpdates } = updates;

    // Update document fields
    const { error: updateError } = await supabase
      .from('documents')
      .update(validUpdates)
      .eq('id', id)
      .eq('shop_id', shopId);

    if (updateError) {
      console.error('Invoice update error:', updateError);
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
    }

    // Sync line items back to document_line_items if provided
    if (Array.isArray(line_items_json) && line_items_json.length > 0) {
      // Delete existing line items
      await supabase
        .from('document_line_items')
        .delete()
        .eq('document_id', id);

      // Rebuild line items with Roll IDs applied
      const lineItemRows = line_items_json.map((svc: any, idx: number) => ({
        document_id: id,
        module: svc.module || 'auto_tint',
        description: svc.label || '',
        quantity: 1,
        unit_price: svc.price || 0,
        line_total: svc.price || 0,
        sort_order: idx,
        custom_fields: {
          ...(svc.serviceKey && { serviceKey: svc.serviceKey }),
          ...(svc.filmId != null && { filmId: svc.filmId }),
          ...(svc.filmName && { filmName: svc.filmName }),
          ...(svc.filmAbbrev && { filmAbbrev: svc.filmAbbrev }),
          ...(svc.shade && { shade: svc.shade }),
          ...(svc.shadeFront && { shadeFront: svc.shadeFront }),
          ...(svc.shadeRear && { shadeRear: svc.shadeRear }),
          ...(svc.discountAmount && { discountAmount: svc.discountAmount }),
          ...(svc.duration && { duration: svc.duration }),
          ...(svc.rollId && { rollId: svc.rollId }),
          ...(svc.rollInventoryId && { rollInventoryId: svc.rollInventoryId }),
          ...(svc.warrantyYears && { warrantyYears: svc.warrantyYears }),
        },
      }));

      // Apply Roll IDs from active inventory
      const filmIds = new Set<number>();
      for (const svc of line_items_json) {
        if (svc.filmId) filmIds.add(svc.filmId);
      }

      if (filmIds.size > 0) {
        // Resolve shade strings to IDs
        const { data: allShades } = await supabase
          .from('auto_film_shades')
          .select('id, film_id, shade_value')
          .in('film_id', [...filmIds]);

        const shadeMap = new Map<string, number>();
        if (allShades) {
          for (const s of allShades) shadeMap.set(`${s.film_id}-${s.shade_value}`, s.id);
        }

        // Fetch active rolls
        const shadeIds = new Set<number>();
        for (const svc of line_items_json) {
          if (!svc.filmId) continue;
          const shadeStr = svc.shadeFront || svc.shade;
          if (shadeStr) {
            const sid = shadeMap.get(`${svc.filmId}-${shadeStr}`);
            if (sid) shadeIds.add(sid);
          }
        }

        if (shadeIds.size > 0) {
          const { data: activeRolls } = await supabase
            .from('auto_roll_inventory')
            .select('id, film_id, shade_id, roll_id')
            .in('film_id', [...filmIds])
            .in('shade_id', [...shadeIds])
            .eq('is_active', true)
            .eq('shop_id', shopId);

          const rollMap = new Map<string, { rollId: string; rollInventoryId: number }>();
          if (activeRolls) {
            for (const roll of activeRolls) rollMap.set(`${roll.film_id}-${roll.shade_id}`, { rollId: roll.roll_id, rollInventoryId: roll.id });
          }

          // Apply Roll IDs to line items
          for (let i = 0; i < lineItemRows.length; i++) {
            const svc = line_items_json[i];
            if (!svc.filmId) continue;
            const shadeStr = svc.shadeFront || svc.shade;
            if (!shadeStr) continue;
            const shadeId = shadeMap.get(`${svc.filmId}-${shadeStr}`);
            if (!shadeId) continue;
            const roll = rollMap.get(`${svc.filmId}-${shadeId}`);
            if (roll) {
              lineItemRows[i].custom_fields.rollId = roll.rollId;
              lineItemRows[i].custom_fields.rollInventoryId = roll.rollInventoryId;
            }
          }
        }
      }

      await supabase
        .from('document_line_items')
        .insert(lineItemRows);
    }

    // Re-fetch with line items
    const { data, error } = await supabase
      .from('documents')
      .select('*, document_line_items(*)')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch updated invoice' }, { status: 500 });
    }

    return NextResponse.json({ invoice: composeDocument(data) });
  } catch (error) {
    console.error('Invoice update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// ============================================================================
// Compose a documents row + line items into the old invoice shape
// for backward compatibility with existing dashboard components
// ============================================================================
function composeDocument(doc: any) {
  const lineItems = (doc.document_line_items || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
  return {
    ...doc,
    invoice_number: doc.doc_number,
    line_items_json: lineItems.map((li: any) => ({
      label: li.description,
      price: li.line_total,
      filmName: li.custom_fields?.filmName,
      filmAbbrev: li.custom_fields?.filmAbbrev,
      filmId: li.custom_fields?.filmId,
      shade: li.custom_fields?.shade,
      shadeFront: li.custom_fields?.shadeFront,
      shadeRear: li.custom_fields?.shadeRear,
      rollId: li.custom_fields?.rollId,
      rollInventoryId: li.custom_fields?.rollInventoryId,
      serviceKey: li.custom_fields?.serviceKey,
      warrantyYears: li.custom_fields?.warrantyYears,
      module: li.module,
      _lineItemId: li.id,
    })),
    _normalized_line_items: lineItems,
  };
}
