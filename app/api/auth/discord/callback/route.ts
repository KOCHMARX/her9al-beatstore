import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, sessionCookie } from '@/lib/auth-session';
import { upsertOAuthUser } from '@/lib/db';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const code=req.nextUrl.searchParams.get('code'),state=req.nextUrl.searchParams.get('state'),saved=req.cookies.get('her9al_discord_state')?.value;
 if(!code||!state||!saved||state!==saved)return NextResponse.redirect(new URL('/login?error=discord_state',req.url));
 const clientId=process.env.DISCORD_CLIENT_ID,clientSecret=process.env.DISCORD_CLIENT_SECRET;
 if(!clientId||!clientSecret)return NextResponse.redirect(new URL('/login?error=discord_config',req.url));
 const redirectUri=`${req.nextUrl.origin}/api/auth/discord/callback`;
 const tr=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'authorization_code',code,redirect_uri:redirectUri}),cache:'no-store'});
 if(!tr.ok)return NextResponse.redirect(new URL('/login?error=discord_token',req.url)); const t=await tr.json();
 const pr=await fetch('https://discord.com/api/users/@me',{headers:{authorization:`Bearer ${t.access_token}`},cache:'no-store'});if(!pr.ok)return NextResponse.redirect(new URL('/login?error=discord_profile',req.url));
 const p=await pr.json(); const avatar=p.avatar?`https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=256`:null;
 try{const appUser=await upsertOAuthUser({provider:'discord',providerUserId:String(p.id),email:p.email??null,name:p.global_name??p.username??null,avatar});const session=createSessionToken({id:appUser.id,provider:'discord',email:appUser.email,name:appUser.display_name,avatar:appUser.avatar_url});const res=NextResponse.redirect(new URL('/profile',req.url));res.cookies.set(sessionCookie.name,session,sessionCookie.options);res.cookies.delete('her9al_discord_state');return res;}catch{return NextResponse.redirect(new URL('/login?error=database',req.url));}
}
