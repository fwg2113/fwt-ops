// ============================================================================
// POST /api/documents/[id]/request-changes
// Customer requests changes to a quote. Stores revision message.
// Public endpoint — uses document context for auth.
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
    const { message, contactPreference = 'sms', customerName } = body;

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Fetch the document
    const { data: doc, error } = await supabaseAdmin
      .from('documents')
      .select('id, status, doc_type, notes')
      .eq('id', documentId)
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Only quotes in sent/viewed status can have changes requested
    if (doc.doc_type !== 'quote') {
      return NextResponse.json({ error: 'Only quotes support change requests' }, { status: 400 });
    }
    if (!['sent', 'viewed'].includes(doc.status)) {
      return NextResponse.json({ error: 'Cannot request changes in current status' }, { status: 400 });
    }

    // Build revision entry
    const revision = {
      timestamp: new Date().toISOString(),
      from: 'customer',
      name: customerName || 'Customer',
      message: message.trim(),
      contactPreference,
    };

    // Append to notes with clear marker
    const existingNotes = doc.notes || '';
    const revisionNote = `\n\n--- CHANGE REQUEST (${new Date().toLocaleDateString()}) ---\n${message.trim()}\nPreferred contact: ${contactPreference}`;
    const updatedNotes = existingNotes + revisionNote;

    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({
        status: 'revision_requested',
        notes: updatedNotes,
      })
      .eq('id', documentId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, revision });
  } catch (err) {
    console.error('Request changes error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
