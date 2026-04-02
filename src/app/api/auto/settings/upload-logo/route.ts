import { NextRequest, NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// POST /api/auto/settings/upload-logo
// Uploads a brand logo to Supabase Storage and returns the public URL
// Body: FormData with 'file' (image), 'brandId' (number), 'type' ('square' | 'wide')
export const POST = withShopAuth(async ({ shopId, req }: { shopId: number; req: NextRequest }) => {
  try {
    const supabase = getAdminClient();
    const formData = await req.formData();

    const file = formData.get('file') as File | null;
    const brandId = formData.get('brandId') as string;
    const logoType = formData.get('type') as string; // 'square' or 'wide'

    if (!file || !brandId || !logoType) {
      return NextResponse.json({ error: 'file, brandId, and type are required' }, { status: 400 });
    }

    if (!['square', 'wide'].includes(logoType)) {
      return NextResponse.json({ error: 'type must be "square" or "wide"' }, { status: 400 });
    }

    // Verify brand belongs to this shop
    const { data: brand } = await supabase
      .from('brands')
      .select('id')
      .eq('id', parseInt(brandId))
      .eq('shop_id', shopId)
      .single();

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    // Generate storage path: shop_{id}/brand_{id}_{type}.{ext}
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const allowedExts = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
    if (!allowedExts.includes(ext)) {
      return NextResponse.json({ error: 'File must be PNG, JPG, WebP, or SVG' }, { status: 400 });
    }

    const path = `shop_${shopId}/brand_${brandId}_${logoType}.${ext}`;

    // Upload to storage (upsert to overwrite existing)
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('brand-logos')
      .upload(path, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Logo upload error:', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('brand-logos')
      .getPublicUrl(path);

    const publicUrl = urlData.publicUrl;

    // Update brand record with logo URL
    const column = logoType === 'square' ? 'logo_square_url' : 'logo_wide_url';
    const { error: updateError } = await supabase
      .from('brands')
      .update({ [column]: publicUrl })
      .eq('id', parseInt(brandId))
      .eq('shop_id', shopId);

    if (updateError) {
      console.error('Brand update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
