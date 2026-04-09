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
      .select('id, shop_id, balance_due, total_paid, status, import_source, created_at')
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
    const newStatus = newBalanceDue <= 0.01 ? 'paid' : (newTotalPaid > 0 ? 'partial' : doc.status);

    // For historic backfill rows, backdate paid_at to the document's
    // created_at (which is already the historic appointment date) instead
    // of "now". Otherwise the invoice payment would appear today even though
    // the work was done weeks/months ago.
    const isHistoric = doc.import_source === 'historic_import';
    const paidAtTimestamp = isHistoric && doc.created_at
      ? doc.created_at
      : new Date().toISOString();

    await supabaseAdmin
      .from('documents')
      .update({
        total_paid: newTotalPaid,
        balance_due: newBalanceDue,
        status: newStatus,
        payment_method: payment_method,
        ...(newStatus === 'paid' ? { paid_at: paidAtTimestamp, payment_confirmed_at: paidAtTimestamp } : {}),
      })
      .eq('id', documentId);

    // If fully paid, update linked booking + customer stats
    if (newStatus === 'paid') {
      await supabaseAdmin
        .from('auto_bookings')
        .update({ status: 'invoiced', total_paid: newTotalPaid, balance_due: 0, payment_method })
        .eq('document_id', documentId);

      // Update customer lifetime stats
      const { data: fullDocForStats } = await supabaseAdmin
        .from('documents')
        .select('customer_id')
        .eq('id', documentId)
        .single();

      if (fullDocForStats?.customer_id) {
        const custId = fullDocForStats.customer_id;
        // Recalculate from all paid bookings + jobs for this customer
        const { data: paidBookings } = await supabaseAdmin
          .from('auto_bookings')
          .select('subtotal, appointment_date')
          .eq('customer_id', custId)
          .in('status', ['invoiced', 'completed']);

        const { data: custJobs } = await supabaseAdmin
          .from('customer_jobs')
          .select('total, job_date')
          .eq('customer_id', custId);

        const allTotals = [
          ...(paidBookings || []).map(b => Number(b.subtotal) || 0),
          ...(custJobs || []).map(j => Number(j.total) || 0),
        ];
        const allDates = [
          ...(paidBookings || []).map(b => b.appointment_date),
          ...(custJobs || []).map(j => j.job_date),
        ].filter(Boolean).sort();

        await supabaseAdmin
          .from('customers')
          .update({
            lifetime_spend: allTotals.reduce((s, t) => s + t, 0),
            visit_count: allTotals.length,
            first_visit_date: allDates[0] || null,
            last_visit_date: allDates[allDates.length - 1] || null,
          })
          .eq('id', custId);
      }
    }

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

// ============================================================================
// DELETE /api/documents/[id]/payments — Void all payments for a document
// ============================================================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    const { error } = await supabaseAdmin
      .from('document_payments')
      .delete()
      .eq('document_id', documentId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Payment void error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
