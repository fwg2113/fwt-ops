// ============================================================================
// DOCUMENT LINE ITEMS API
// POST — add line item(s) to a document
// PATCH — update a specific line item
// DELETE — remove a line item
// ============================================================================

import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

function extractDocId(url: string): string | null {
  const match = url.match(/\/documents\/([^/]+)\/line-items/);
  return match?.[1] || null;
}

// POST /api/documents/[id]/line-items — add one or more line items
export const POST = withShopAuth(async ({ shopId, req }) => {
  const documentId = extractDocId(req.url);
  if (!documentId) return NextResponse.json({ error: 'document id required' }, { status: 400 });

  const body = await req.json();
  const supabase = getAdminClient();

  // Verify document belongs to this shop
  const { data: doc } = await supabase
    .from('documents')
    .select('id')
    .eq('id', documentId)
    .eq('shop_id', shopId)
    .single();

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  // Accept single item or array
  const items = Array.isArray(body) ? body : [body];
  const rows = items.map((item: any, idx: number) => ({
    document_id: documentId,
    module: item.module || 'auto_tint',
    group_id: item.group_id || null,
    category: item.category || null,
    description: item.description || '',
    quantity: item.quantity || 1,
    unit_price: item.unit_price || item.price || 0,
    line_total: item.line_total || item.price || 0,
    sort_order: item.sort_order ?? idx,
    custom_fields: item.custom_fields || {},
    taxable: item.taxable !== false,
  }));

  const { data, error } = await supabase
    .from('document_line_items')
    .insert(rows)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recalculate document subtotal
  await recalcSubtotal(supabase, documentId);

  return NextResponse.json(data);
});

// PATCH /api/documents/[id]/line-items — update a line item by item id in body
export const PATCH = withShopAuth(async ({ shopId, req }) => {
  const documentId = extractDocId(req.url);
  if (!documentId) return NextResponse.json({ error: 'document id required' }, { status: 400 });

  const body = await req.json();
  const { id: itemId, ...updates } = body;

  if (!itemId) return NextResponse.json({ error: 'line item id required' }, { status: 400 });

  const supabase = getAdminClient();

  // Verify document belongs to this shop
  const { data: doc } = await supabase
    .from('documents')
    .select('id')
    .eq('id', documentId)
    .eq('shop_id', shopId)
    .single();

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('document_line_items')
    .update(updates)
    .eq('id', itemId)
    .eq('document_id', documentId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recalcSubtotal(supabase, documentId);

  return NextResponse.json(data);
});

// DELETE /api/documents/[id]/line-items — delete by item id in query param
export const DELETE = withShopAuth(async ({ shopId, req }) => {
  const documentId = extractDocId(req.url);
  if (!documentId) return NextResponse.json({ error: 'document id required' }, { status: 400 });

  const url = new URL(req.url);
  const itemId = url.searchParams.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId query param required' }, { status: 400 });

  const supabase = getAdminClient();

  // Verify document belongs to this shop
  const { data: doc } = await supabase
    .from('documents')
    .select('id')
    .eq('id', documentId)
    .eq('shop_id', shopId)
    .single();

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const { error } = await supabase
    .from('document_line_items')
    .delete()
    .eq('id', itemId)
    .eq('document_id', documentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recalcSubtotal(supabase, documentId);

  return NextResponse.json({ success: true });
});

// Recalculate document subtotal from line items
async function recalcSubtotal(supabase: any, documentId: string) {
  const { data: items } = await supabase
    .from('document_line_items')
    .select('line_total')
    .eq('document_id', documentId);

  const subtotal = (items || []).reduce((sum: number, item: any) => sum + (Number(item.line_total) || 0), 0);

  await supabase
    .from('documents')
    .update({ subtotal })
    .eq('id', documentId);
}
