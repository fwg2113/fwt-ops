// ============================================================================
// DOCUMENT API — SINGLE DOCUMENT OPERATIONS
// GET /api/documents/[id] — fetch with line items
// PATCH /api/documents/[id] — update document fields
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

export const GET = withShopAuth(async ({ shopId, req }) => {
  const id = req.url.split('/documents/')[1]?.split('?')[0]?.split('/')[0];
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = getAdminClient();

  const { data: doc, error } = await supabase
    .from('documents')
    .select('*, document_line_items(*), document_payments(*)')
    .eq('id', id)
    .eq('shop_id', shopId)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  return NextResponse.json({
    ...doc,
    line_items: doc.document_line_items || [],
    payments: doc.document_payments || [],
  });
});

export const PATCH = withShopAuth(async ({ shopId, req }) => {
  const id = req.url.split('/documents/')[1]?.split('?')[0]?.split('/')[0];
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();

  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('documents')
    .update(body)
    .eq('id', id)
    .eq('shop_id', shopId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
});
