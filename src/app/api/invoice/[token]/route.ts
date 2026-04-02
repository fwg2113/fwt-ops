import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// ============================================================================
// GET /api/invoice/[token]
// Public endpoint — fetches document by public_token for customer-facing view
// No auth required. Marks as 'viewed' on first access.
// ============================================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.length < 16) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    // Query from new documents table with line items
    const { data: document, error } = await supabaseAdmin
      .from('documents')
      .select('*, document_line_items(*)')
      .eq('public_token', token)
      .single();

    if (error || !document) {
      // Fallback: try legacy auto_invoices for tokens not yet in documents
      const { data: legacyInvoice } = await supabaseAdmin
        .from('auto_invoices')
        .select('*')
        .eq('public_token', token)
        .single();

      if (!legacyInvoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }

      const { data: shopConfig } = await supabaseAdmin
        .from('shop_config')
        .select('shop_name, shop_phone, shop_email, shop_address, cc_fee_percent, cc_fee_flat, cash_discount_percent, payment_methods, checkout_flow_config, module_invoice_content')
        .eq('id', legacyInvoice.shop_id || 1)
        .single();

      return NextResponse.json({ invoice: legacyInvoice, shop: shopConfig || null });
    }

    const shopId = document.shop_id || 1;

    const { data: shopConfig } = await supabaseAdmin
      .from('shop_config')
      .select('shop_name, shop_phone, shop_email, shop_address, cc_fee_percent, cc_fee_flat, cash_discount_percent, payment_methods, checkout_flow_config, module_invoice_content')
      .eq('id', shopId)
      .single();

    // Mark as viewed on first access
    if (!document.viewed_at && document.status === 'sent') {
      await supabaseAdmin
        .from('documents')
        .update({ viewed_at: new Date().toISOString(), status: 'viewed' })
        .eq('id', document.id);
      document.viewed_at = new Date().toISOString();
      document.status = 'viewed';
    }

    return NextResponse.json({
      document,
      shop: shopConfig || null,
    });
  } catch (error) {
    console.error('Public invoice fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================================
// POST /api/invoice/[token]
// Public endpoint — saves signature/initials data to document
// ============================================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { initials_data, signature_data } = await request.json();

    if (!token || token.length < 16) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    // Try new documents table first
    const { data: document } = await supabaseAdmin
      .from('documents')
      .select('id')
      .eq('public_token', token)
      .single();

    if (document) {
      await supabaseAdmin
        .from('documents')
        .update({
          initials_data: initials_data || null,
          signature_data: signature_data || null,
          signed_at: new Date().toISOString(),
          signed_via: 'remote_link',
        })
        .eq('id', document.id);

      return NextResponse.json({ success: true });
    }

    // Fallback: legacy auto_invoices
    const { data: legacyInvoice } = await supabaseAdmin
      .from('auto_invoices')
      .select('id')
      .eq('public_token', token)
      .single();

    if (!legacyInvoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    await supabaseAdmin
      .from('auto_invoices')
      .update({
        initials_data: initials_data || null,
        signature_data: signature_data || null,
        signed_at: new Date().toISOString(),
        signed_via: 'remote_link',
      })
      .eq('id', legacyInvoice.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Signature save error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
