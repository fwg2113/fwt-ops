// ============================================================================
// POST /api/documents/[id]/undo-approval
// Customer changes their mind after approving. Reverts to quote status.
// Only works if no payments have been made yet.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    const { data: doc, error } = await supabaseAdmin
      .from('documents')
      .select('id, status, doc_type, total_paid, deposit_paid')
      .eq('id', documentId)
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Only approved documents can be undone
    if (doc.status !== 'approved') {
      return NextResponse.json({ error: 'Only approved documents can be reverted' }, { status: 400 });
    }

    // Block if payments have been made (can't undo after money changed hands)
    if ((doc.total_paid || 0) > 0 || (doc.deposit_paid || 0) > 0) {
      return NextResponse.json({ error: 'Cannot undo approval after payments have been recorded' }, { status: 400 });
    }

    // Cancel any appointments that were created from this document
    const { data: linkedAppointments } = await supabaseAdmin
      .from('auto_bookings')
      .select('id')
      .eq('document_id', documentId)
      .neq('status', 'cancelled');

    if (linkedAppointments && linkedAppointments.length > 0) {
      await supabaseAdmin
        .from('auto_bookings')
        .update({ status: 'cancelled' })
        .in('id', linkedAppointments.map(a => a.id));
    }

    // Revert to viewed quote status and clear booking_id
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('documents')
      .update({
        status: 'viewed',
        doc_type: 'quote',
        approved_at: null,
        booking_id: null,
      })
      .eq('id', documentId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      document: updated,
      cancelledAppointments: linkedAppointments?.length || 0,
    });
  } catch (err) {
    console.error('Undo approval error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
