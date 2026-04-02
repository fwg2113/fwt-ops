// ============================================================================
// FILE STORAGE UTILITY
// Abstraction layer for file uploads. Currently uses Supabase Storage.
// To switch to Cloudflare R2: change the implementation in this file only.
// All paths follow SaaS pattern: /{shop_id}/documents/{document_id}/{filename}
// ============================================================================

import { supabaseAdmin } from '@/app/lib/supabase-server';

const BUCKET = 'documents';

export interface UploadResult {
  key: string;       // Storage path (e.g., "1/documents/abc123/photo.jpg")
  url: string;       // Signed URL for access
  filename: string;
  contentType: string;
  size: number;
}

/**
 * Upload a file to storage. Returns the storage key and a signed URL.
 * Path pattern: /{shopId}/documents/{documentId}/{timestamp}_{filename}
 */
export async function uploadFile(
  shopId: number,
  documentId: string,
  file: Buffer | Uint8Array,
  filename: string,
  contentType: string
): Promise<UploadResult | { error: string }> {
  // Build SaaS-safe path with timestamp to prevent collisions
  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${shopId}/documents/${documentId}/${timestamp}_${safeName}`;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(key, file, {
      contentType,
      upsert: false,
    });

  if (error) {
    console.error('Storage upload error:', error);
    return { error: error.message };
  }

  // Generate signed URL (valid for 1 year)
  const { data: urlData } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(key, 60 * 60 * 24 * 365);

  return {
    key,
    url: urlData?.signedUrl || '',
    filename: safeName,
    contentType,
    size: file.length,
  };
}

/**
 * Get a signed URL for an existing file.
 */
export async function getSignedUrl(key: string, expiresIn = 60 * 60 * 24): Promise<string> {
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(key, expiresIn);
  return data?.signedUrl || '';
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(key: string): Promise<boolean> {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .remove([key]);
  return !error;
}

/**
 * List files for a document.
 */
export async function listFiles(shopId: number, documentId: string): Promise<string[]> {
  const prefix = `${shopId}/documents/${documentId}/`;
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(prefix);
  return (data || []).map(f => `${prefix}${f.name}`);
}
