import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const rawUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    '';

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const url = rawUrl.trim().replace(/\/+$/, '');

  if (!url) {
    return NextResponse.json(
      { error: 'SUPABASE_URL_MISSING' },
      { status: 500 }
    );
  }

  if (!key) {
    return NextResponse.json(
      { error: 'SUPABASE_KEY_MISSING' },
      { status: 500 }
    );
  }

  try {
    const host = new URL(url).host;

    const response = await fetch(`${url}/rest/v1/beats?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: 'no-store',
    });

    const body = await response.text();

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      host,
      response: body.slice(0, 500),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'SUPABASE_FETCH_FAILED',
        message: error?.message || String(error),
        cause: error?.cause?.code || error?.cause?.message || null,
        host: (() => {
          try {
            return new URL(url).host;
          } catch {
            return 'INVALID_URL';
          }
        })(),
      },
      { status: 500 }
    );
  }
}