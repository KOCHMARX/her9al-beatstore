import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const db = adminDb();

    const { data, error } = await db
      .from('beats')
      .select(`
        id,
        title,
        slug,
        bpm,
        musical_key,
        mood,
        cover_url,
        preview_url,
        published,
        created_at,
        album_id
      `)
      .eq('published', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('HER9AL BEATS ERROR:', error);

      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
          code: error.code
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ beats: data || [] });
  } catch (error) {
    console.error('HER9AL BEATS FATAL:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unknown database error'
      },
      { status: 500 }
    );
  }
}