// ============================================================================
// POST /api/auto/redeem-gc
// Apply a gift certificate or promo code to a document at counter checkout.
//
// - Validates the code against auto_gift_certificates (same rules as
//   /api/auto/validate-gc: not redeemed for dollar GCs, in date range, etc.)
// - For dollar GCs: records a document_payments entry for the GC amount,
//   updates the doc's total_paid + balance_due, marks the GC redeemed.
// - For percent promos: computes the discount as (current balance × percent),
//   records a payment entry for that amount, but does NOT mark redeemed
//   (percent promos are reusable shop-wide).
// - All updates are scoped to the document. The GC table update is the only
//   write outside the document context.
//
// Request body: { code, documentId }
// Response: { success, payment, gc, newBalance, newTotalPaid, newStatus }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const { code, documentId } = await request.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ success: false, error: 'No code provided' }, { status: 400 });
    }
    if (!documentId || typeof documentId !== 'string') {
      return NextResponse.json({ success: false, error: 'No documentId provided' }, { status: 400 });
    }

    const trimmedCode = code.trim();

    // 1) Look up the GC
    const { data: gc, error: gcErr } = await supabaseAdmin
      .from('auto_gift_certificates')
      .select('*')
      .ilike('gc_code', trimmedCode)
      .single();

    if (gcErr || !gc) {
      return NextResponse.json({ success: false, error: 'Code not found' }, { status: 404 });
    }

    // 2) Validate
    if (gc.discount_type === 'dollar' && gc.redeemed) {
      return NextResponse.json({ success: false, error: 'This gift certificate has already been redeemed' }, { status: 400 });
    }
    const now = new Date();
    if (gc.start_date && new Date(gc.start_date) > now) {
      return NextResponse.json({ success: false, error: 'This promo code is not yet active' }, { status: 400 });
    }
    if (gc.end_date && new Date(gc.end_date) < now) {
      return NextResponse.json({ success: false, error: 'This promo code has expired' }, { status: 400 });
    }

    // 3) Look up the document
    const { data: doc, error: docErr } = await supabaseAdmin
      .from('documents')
      .select('id, shop_id, subtotal, total_paid, balance_due, status, customer_id, deposit_paid')
      .eq('id', documentId)
      .single();

    if (docErr || !doc) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }

    // 4) Compute the dollar value to apply
    let amount: number;
    if (gc.discount_type === 'dollar') {
      amount = Number(gc.amount) || 0;
    } else {
      // Percent: apply against the current balance_due (so stacks correctly)
      amount = Math.round(((Number(doc.balance_due) || 0) * (Number(gc.amount) || 0) / 100) * 100) / 100;
    }

    if (amount <= 0) {
      return NextResponse.json({ success: false, error: 'Computed amount is zero — nothing to apply' }, { status: 400 });
    }

    // Cap the applied amount at the current balance to avoid over-payment
    const currentBalance = Number(doc.balance_due) || 0;
    const appliedAmount = Math.min(amount, currentBalance);

    if (appliedAmount <= 0) {
      return NextResponse.json({ success: false, error: 'Document is already fully paid — nothing to apply' }, { status: 400 });
    }

    // 5) Insert the payment record
    const { data: payment, error: payErr } = await supabaseAdmin
      .from('document_payments')
      .insert({
        document_id: documentId,
        shop_id: doc.shop_id || 1,
        amount: appliedAmount,
        payment_method: 'gift_certificate',
        processor: 'manual',
        status: 'confirmed',
        notes: `GC: ${gc.gc_code}${gc.discount_type === 'percent' ? ` (${gc.amount}% off)` : ''}`,
      })
      .select()
      .single();

    if (payErr) {
      return NextResponse.json({ success: false, error: `Failed to record payment: ${payErr.message}` }, { status: 500 });
    }

    // 6) Update document totals
    const newTotalPaid = (Number(doc.total_paid) || 0) + appliedAmount;
    const newBalanceDue = Math.max(0, currentBalance - appliedAmount);
    const newStatus = newBalanceDue <= 0.01 ? 'paid' : (newTotalPaid > 0 ? 'partial' : doc.status);

    const docUpdate: Record<string, unknown> = {
      total_paid: newTotalPaid,
      balance_due: newBalanceDue,
      status: newStatus,
      payment_method: 'gift_certificate',
    };
    if (newStatus === 'paid') {
      docUpdate.paid_at = new Date().toISOString();
      docUpdate.payment_confirmed_at = new Date().toISOString();
    }

    await supabaseAdmin
      .from('documents')
      .update(docUpdate)
      .eq('id', documentId);

    // If fully paid, sync the linked booking too
    if (newStatus === 'paid') {
      await supabaseAdmin
        .from('auto_bookings')
        .update({ status: 'invoiced', total_paid: newTotalPaid, balance_due: 0, payment_method: 'gift_certificate' })
        .eq('document_id', documentId);
    }

    // 7) Mark the GC redeemed (dollar GCs only — percent promos stay reusable)
    if (gc.discount_type === 'dollar') {
      await supabaseAdmin
        .from('auto_gift_certificates')
        .update({
          redeemed: true,
          redeemed_at: new Date().toISOString(),
          redeemed_booking_id: documentId,
        })
        .eq('id', gc.id);
    }

    return NextResponse.json({
      success: true,
      payment,
      gc: {
        code: gc.gc_code,
        discountType: gc.discount_type,
        value: gc.amount,
      },
      appliedAmount,
      newTotalPaid,
      newBalanceDue,
      newStatus,
    });
  } catch (error) {
    console.error('GC redeem error:', error);
    return NextResponse.json({ success: false, error: 'Redemption failed' }, { status: 500 });
  }
}
