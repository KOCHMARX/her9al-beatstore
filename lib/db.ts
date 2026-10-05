import { createClient } from '@supabase/supabase-js';

export function adminDb() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('SUPABASE CONFIG MISSING', { hasUrl: !!url, hasKey: !!key });
    throw new Error('Supabase server configuration is missing');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AppUser = {
  id: string;
  provider: 'google' | 'discord';
  provider_user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: 'owner' | 'admin' | 'editor' | 'customer';
};

export async function upsertOAuthUser(input: {
  provider: 'google' | 'discord';
  providerUserId: string;
  email?: string | null;
  name?: string | null;
  avatar?: string | null;
}) {
  const db = adminDb();
  const ownerEmail = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const incomingEmail = (input.email || '').trim().toLowerCase();
  const role = ownerEmail && incomingEmail === ownerEmail ? 'owner' : 'customer';

  const { data: existing, error: lookupError } = await db
    .from('app_users')
    .select('*')
    .eq('provider', input.provider)
    .eq('provider_user_id', input.providerUserId)
    .maybeSingle();

  if (lookupError) {
    console.error('HER9AL USER LOOKUP ERROR:', lookupError);
    throw lookupError;
  }

  if (existing) {
    const patch: Record<string, unknown> = {
      email: input.email ?? existing.email,
      updated_at: new Date().toISOString(),
    };
    if (!existing.display_name && input.name) patch.display_name = input.name;
    if (!existing.avatar_url && input.avatar) patch.avatar_url = input.avatar;
    if (role === 'owner' && existing.role !== 'owner') patch.role = 'owner';

    const { data, error } = await db
      .from('app_users')
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      console.error('HER9AL USER UPDATE ERROR:', error);
      throw error;
    }
    return data as AppUser;
  }

  const { data, error } = await db
    .from('app_users')
    .insert({
      provider: input.provider,
      provider_user_id: input.providerUserId,
      email: input.email ?? null,
      display_name: input.name ?? null,
      avatar_url: input.avatar ?? null,
      role,
    })
    .select('*')
    .single();

  if (error) {
    console.error('HER9AL USER INSERT ERROR:', error);
    throw error;
  }
  return data as AppUser;
}
