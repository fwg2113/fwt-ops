// ============================================================================
// DOCUMENT ATTACHMENTS API
// POST — upload file(s) to a document
// GET — list attachments for a document
// DELETE — remove an attachment
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { uploadFile, deleteFile, getSignedUrl } from '@/app/lib/storage';

function extractDocId(url: string): string | null {
  const match = url.match(/\/documents\/([^/]+)\/attachments/);
  return match?.[1] || null;
}

// POST /api/documents/[id]/attachments — upload file
export async function POST(request: NextRequest) {
  try {
    const documentId = extractDocId(request.url);
    if (!documentId) return NextResponse.json({ error: 'document id required' }, { status: 400 });

    // Verify document exists and get shop_id
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .select('id, shop_id')
      .eq('id', documentId)
      .single();

    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const target = formData.get('target') as string || 'project'; // 'project' or 'line_item'
    const lineItemId = formData.get('line_item_id') as string || null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(
      doc.shop_id || 1,
      documentId,
      buffer,
      file.name,
      file.type
    );

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // If targeting a line item, update its custom_fields.attachments
    if (target === 'line_item' && lineItemId) {
      const { data: li } = await supabaseAdmin
        .from('document_line_items')
        .select('custom_fields')
        .eq('id', lineItemId)
        .single();

      if (li) {
        const cf = li.custom_fields || {};
        const attachments = Array.isArray(cf.attachments) ? cf.attachments : [];
        attachments.push({
          key: result.key,
          url: result.url,
          filename: result.filename,
          contentType: result.contentType,
          size: result.size,
          uploadedAt: new Date().toISOString(),
        });

        await supabaseAdmin
          .from('document_line_items')
          .update({ custom_fields: { ...cf, attachments } })
          .eq('id', lineItemId);
      }
    }

    // Store as project-level attachment on the document
    if (target === 'project') {
      const { data: docData } = await supabaseAdmin
        .from('documents')
        .select('attachments')
        .eq('id', documentId)
        .single();

      const existing = Array.isArray(docData?.attachments) ? docData.attachments : [];
      existing.push({
        key: result.key,
        url: result.url,
        filename: result.filename,
        contentType: result.contentType,
        size: result.size,
        uploadedAt: new Date().toISOString(),
      });

      await supabaseAdmin
        .from('documents')
        .update({ attachments: existing })
        .eq('id', documentId);
    }

    return NextResponse.json({
      attachment: {
        key: result.key,
        url: result.url,
        filename: result.filename,
        contentType: result.contentType,
        size: result.size,
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Attachment upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// DELETE /api/documents/[id]/attachments?key=xxx — remove attachment
export async function DELETE(request: NextRequest) {
  try {
    const documentId = extractDocId(request.url);
    if (!documentId) return NextResponse.json({ error: 'document id required' }, { status: 400 });

    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

    const success = await deleteFile(key);
    if (!success) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Attachment delete error:', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
