// ============================================================================
// POST /api/documents/[id]/payments — Record a payment
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const body = await request.json();
    const { amount, payment_method, processor, notes } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    // Verify document exists
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .select('id, shop_id, balance_due, total_paid, status')
      .eq('id', documentId)
      .single();

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Record the payment
    const { data: payment, error } = await supabaseAdmin
      .from('document_payments')
      .insert({
        document_id: documentId,
        shop_id: doc.shop_id || 1,
        amount: parseFloat(amount),
        payment_method: payment_method || 'cash',
        processor: processor || 'manual',
        status: 'confirmed',
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update document totals
    const newTotalPaid = (doc.total_paid || 0) + parseFloat(amount);
    const newBalanceDue = Math.max(0, (doc.balance_due || 0) - parseFloat(amount));
    const newStatus = newBalanceDue <= 0 ? 'paid' : (newTotalPaid > 0 ? 'partial' : doc.status);

    await supabaseAdmin
      .from('documents')
      .update({
        total_paid: newTotalPaid,
        balance_due: newBalanceDue,
        status: newStatus,
        payment_method: payment_method,
        ...(newStatus === 'paid' ? { paid_at: new Date().toISOString(), payment_confirmed_at: new Date().toISOString() } : {}),
      })
      .eq('id', documentId);

    // Auto-post revenue transaction to bookkeeping ledger
    try {
      // Get document details for the transaction
      const { data: fullDoc } = await supabaseAdmin
        .from('documents')
        .select('doc_number, customer_name, vehicle_make, vehicle_model')
        .eq('id', documentId)
        .single();

      const { data: txnId } = await supabaseAdmin
        .rpc('generate_transaction_id', { p_shop_id: doc.shop_id || 1 });

      await supabaseAdmin
        .from('transactions')
        .insert({
          shop_id: doc.shop_id || 1,
          transaction_id: txnId || `TXN-${Date.now()}`,
          txn_date: new Date().toISOString().split('T')[0],
          brand: 'default',
          direction: 'IN',
          event_type: 'SALE',
          amount: parseFloat(amount),
          account: processor || 'Manual',
          category: 'Auto Tint Revenue',
          vendor_or_customer: fullDoc?.customer_name || null,
          invoice_id: fullDoc?.doc_number || null,
          payment_method: payment_method || null,
          processor: processor || null,
          memo: fullDoc ? `${fullDoc.vehicle_make || ''} ${fullDoc.vehicle_model || ''}`.trim() || null : null,
          posted_by: 'system',
        });
    } catch (txnErr) {
      // Don't fail the payment if transaction posting fails
      console.error('Revenue auto-post error:', txnErr);
    }

    return NextResponse.json({
      payment,
      document: { total_paid: newTotalPaid, balance_due: newBalanceDue, status: newStatus },
    });
  } catch (err) {
    console.error('Payment recording error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
