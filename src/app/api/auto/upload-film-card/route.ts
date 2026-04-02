import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';

// POST — Upload a custom film card image
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const filmId = formData.get('filmId') as string | null;

    if (!file || !filmId) {
      return NextResponse.json({ error: 'file and filmId required' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/svg+xml', 'image/png', 'image/jpeg'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only SVG, PNG, and JPG files are allowed' }, { status: 400 });
    }

    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 2MB' }, { status: 400 });
    }

    // Generate storage path
    const ext = file.name.split('.').pop() || 'png';
    const path = `${filmId}/${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from('film-cards')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('film-cards')
      .getPublicUrl(path);

    // Update the film record
    const { error: updateError } = await supabaseAdmin
      .from('auto_films')
      .update({ card_image_url: urlData.publicUrl })
      .eq('id', parseInt(filmId));

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: urlData.publicUrl });
  } catch (error) {
    console.error('Upload film card error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE — Remove a custom film card image
export async function DELETE(request: NextRequest) {
  try {
    const { filmId } = await request.json();

    if (!filmId) {
      return NextResponse.json({ error: 'filmId required' }, { status: 400 });
    }

    // Get current URL to extract storage path
    const { data: film } = await supabaseAdmin
      .from('auto_films')
      .select('card_image_url')
      .eq('id', filmId)
      .single();

    if (film?.card_image_url) {
      // Extract path from URL (after /film-cards/)
      const urlParts = film.card_image_url.split('/film-cards/');
      if (urlParts.length > 1) {
        const storagePath = urlParts[1].split('?')[0]; // Remove query params
        await supabaseAdmin.storage.from('film-cards').remove([storagePath]);
      }
    }

    // Clear the column
    const { error } = await supabaseAdmin
      .from('auto_films')
      .update({ card_image_url: null })
      .eq('id', filmId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete film card error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
