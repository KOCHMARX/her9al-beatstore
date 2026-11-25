import { NextRequest, NextResponse } from 'next/server';
import { sessionCookie, verifySessionToken } from '@/lib/auth-session';
import { adminDb } from '@/lib/db';
export const runtime='nodejs';
export async function GET(req:NextRequest){
  const payload=verifySessionToken(req.cookies.get(sessionCookie.name)?.value);
  if(!payload) return NextResponse.json({user:null});
  const db=adminDb();
  const {data}=await db.from('app_users').select('id,email,display_name,avatar_url,role,provider').eq('id',payload.id).maybeSingle();
  return NextResponse.json({user:data||null});
}
