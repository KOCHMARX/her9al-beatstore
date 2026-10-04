import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/current-user';
import { adminDb } from '@/lib/db';
export const runtime='nodejs';
export async function GET(){const u=await currentUser();return NextResponse.json({user:u});}
export async function PATCH(req:NextRequest){const u=await currentUser();if(!u)return NextResponse.json({error:'unauthorized'},{status:401});const body=await req.json();const display_name=String(body.display_name||'').trim().slice(0,50);const avatar_url=String(body.avatar_url||'').trim().slice(0,500);const db=adminDb();const {data,error}=await db.from('app_users').update({display_name,avatar_url:avatar_url||null,updated_at:new Date().toISOString()}).eq('id',u.id).select('id,email,display_name,avatar_url,role,provider').single();if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({user:data});}
