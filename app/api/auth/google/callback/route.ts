import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, sessionCookie } from '@/lib/auth-session';
import { upsertOAuthUser } from '@/lib/db';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const code=req.nextUrl.searchParams.get('code'), state=req.nextUrl.searchParams.get('state'), saved=req.cookies.get('her9al_google_state')?.value;
 if(!code||!state||!saved||state!==saved) return NextResponse.redirect(new URL('/login?error=google_state',req.url));
 const clientId=process.env.GOOGLE_CLIENT_ID, clientSecret=process.env.GOOGLE_CLIENT_SECRET;
 if(!clientId||!clientSecret) return NextResponse.redirect(new URL('/login?error=google_config',req.url));
 const redirectUri=`${req.nextUrl.origin}/api/auth/google/callback`;
 const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code'}),cache:'no-store'});
 if(!tokenRes.ok)return NextResponse.redirect(new URL('/login?error=google_token',req.url));
 const token=await tokenRes.json();
 const profileRes=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:`Bearer ${token.access_token}`},cache:'no-store'});
 if(!profileRes.ok)return NextResponse.redirect(new URL('/login?error=google_profile',req.url));
 const p=await profileRes.json();
 try{
   const appUser=await upsertOAuthUser({provider:'google',providerUserId:String(p.sub),email:p.email??null,name:p.name??null,avatar:p.picture??null});
   const session=createSessionToken({id:appUser.id,provider:'google',email:appUser.email,name:appUser.display_name,avatar:appUser.avatar_url});
   const res=NextResponse.redirect(new URL('/profile',req.url));res.cookies.set(sessionCookie.name,session,sessionCookie.options);res.cookies.delete('her9al_google_state');return res;
 } catch (error) {
  console.error('HER9AL GOOGLE DATABASE ERROR:', error);

  return NextResponse.redirect(
    new URL('/login?error=database', req.url)
  );
}