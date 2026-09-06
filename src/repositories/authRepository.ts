import { ERR } from '../data/errors';
import { isValidEmail, isValidPhone, passwordError } from '../core/logic';
import { sessionStore } from '../core/storage';
import { isSupabaseConfigured, supabase } from '../core/supabase';
import type { PublicUser, User, UserRole } from '../core/types';

export interface RegisterInput {
  name: string;
  phone: string;
  email?: string;
  password: string;
}

/** Shape returned by supabase SELECT * on public.users */
interface SupabaseUserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole | null;
  created_at: string | null;
}

/** Adapter: User → PublicUser (kept for callers that still pass a User). */
export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    role: u.role,
    avatar: u.avatar,
    createdAt: u.createdAt,
  };
}

/** Adapter: Supabase row (snake_case) → PublicUser (camelCase). */
function rowToPublicUser(row: SupabaseUserRow, phoneFallback: string): PublicUser {
  return {
    id: row.id,
    name: row.full_name ?? '',
    phone: phoneFallback,
    email: row.email ?? undefined,
    role: (row.role as UserRole) ?? 'customer',
    avatar: null,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

/** Convert a phone like 0550123456 to a synthetic email for Supabase auth. */
function phoneToAuthEmail(phone: string): string {
  return `${phone.replace(/\D/g, '')}@mycart.local`;
}

/**
 * Auth repository — backed by Supabase.
 * Throws ERR.network() when Supabase is not configured so the UI shows a
 * meaningful Arabic message instead of a stack trace.
 */
export const authRepository = {
  async register(input: RegisterInput): Promise<PublicUser> {
    const name = input.name.trim();
    const phone = input.phone.trim();
    const email = input.email?.trim() || undefined;

    if (name.length < 3) throw ERR.generic('يرجى إدخال الاسم الكامل.');
    if (!isValidPhone(phone)) throw ERR.generic('رقم هاتف جزائري غير صحيح (مثال: 0550123456).');
    const pwdErr = passwordError(input.password);
    if (pwdErr) throw ERR.generic(pwdErr);
    if (email && !isValidEmail(email)) throw ERR.generic('البريد الإلكتروني غير صحيح.');

    if (!isSupabaseConfigured) throw ERR.network();

    try {
      const authEmail = email ?? phoneToAuthEmail(phone);

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: authEmail,
        password: input.password,
        options: { data: { full_name: name, phone } },
      });

      if (signUpError) {
        if (/already registered|user already/i.test(signUpError.message)) {
          if (email && /email/i.test(signUpError.message)) throw ERR.emailExists();
          throw ERR.phoneExists();
        }
        throw ERR.generic(signUpError.message);
      }

      const authUserId = signUpData.user?.id;
      if (!authUserId) throw ERR.server();

      let row: SupabaseUserRow | null = null;
      for (let i = 0; i < 5; i += 1) {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, full_name, role, created_at')
          .eq('id', authUserId)
          .maybeSingle();
        if (!error && data) {
          row = data as SupabaseUserRow;
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      if (!row) {
        const { data, error } = await supabase
          .from('users')
          .insert({ id: authUserId, email: authEmail, full_name: name, role: 'customer' })
          .select('id, email, full_name, role, created_at')
          .single();
        if (error || !data) throw ERR.server();
        row = data as SupabaseUserRow;
      }

      const publicUser = rowToPublicUser(row, phone);
      await sessionStore.set(publicUser.id);
      return publicUser;
    } catch (e) {
      if (e instanceof Error && 'code' in e) throw e;
      throw ERR.network();
    }
  },
  async login(identifier: string, password: string): Promise<PublicUser> {
    const id = identifier.trim();
    if (!id || !password) throw ERR.generic('���� ����� �������� �����.');
    if (!isSupabaseConfigured) throw ERR.network();

    try {
      const isEmailShape = id.includes('@');
      const authEmail = isEmailShape ? id : phoneToAuthEmail(id);
      // eslint-disable-next-line no-console
      console.log('[auth.login] attempting signInWithPassword for:', authEmail);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (error) {
        // eslint-disable-next-line no-console
        console.error('[auth.login] signInWithPassword failed:', {
          status: error.status,
          name: error.name,
          message: error.message,
        });
        throw ERR.invalidCredentials();
      }
      if (!data.user) {
        // eslint-disable-next-line no-console
        console.error('[auth.login] signInWithPassword returned no user and no error');
        throw ERR.invalidCredentials();
      }

      // eslint-disable-next-line no-console
      console.log('[auth.login] auth ok, user.id=', data.user.id, '— fetching public.users row');

      const { data: row, error: profileError } = await supabase
        .from('users')
        .select('id, email, full_name, role, created_at')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError) {
        // eslint-disable-next-line no-console
        console.error('[auth.login] failed to SELECT public.users:', {
          code: profileError.code,
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint,
        });
        throw ERR.server();
      }
      if (!row) {
        // eslint-disable-next-line no-console
        console.warn(
          '[auth.login] no public.users row found for auth user, attempting fallback INSERT',
        );
        const { data: created, error: createError } = await supabase
          .from('users')
          .insert({
            id: data.user.id,
            email: data.user.email ?? authEmail,
            full_name: (data.user.user_metadata?.full_name as string) ?? '',
            role: 'customer',
          })
          .select('id, email, full_name, role, created_at')
          .single();
        if (createError || !created) {
          // eslint-disable-next-line no-console
          console.error('[auth.login] fallback INSERT into public.users failed:', {
            code: createError?.code,
            message: createError?.message,
            details: createError?.details,
            hint: createError?.hint,
          });
          throw ERR.server();
        }
        const publicUser = rowToPublicUser(created as SupabaseUserRow, isEmailShape ? '' : id);
        await sessionStore.set(publicUser.id);
        // eslint-disable-next-line no-console
        console.log('[auth.login] fallback INSERT ok, user.role=', publicUser.role);
        return publicUser;
      }

      const publicUser = rowToPublicUser(row as SupabaseUserRow, isEmailShape ? '' : id);
      await sessionStore.set(publicUser.id);
      // eslint-disable-next-line no-console
      console.log('[auth.login] success, user.role=', publicUser.role, 'id=', publicUser.id);
      return publicUser;
    } catch (e) {
      if (e instanceof Error && 'code' in e) throw e;
      // eslint-disable-next-line no-console
      console.error('[auth.login] unexpected error:', e);
      throw ERR.network();
    }
  },

  async logout(): Promise<void> {
    try {
      if (isSupabaseConfigured) await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    await sessionStore.clear();
  },

  async restoreSession(): Promise<PublicUser | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const { data } = await supabase.auth.getSession();
      const authUserId = data.session?.user?.id;
      if (!authUserId) {
        await sessionStore.clear();
        return null;
      }

      const { data: row, error } = await supabase
        .from('users')
        .select('id, email, full_name, role, created_at')
        .eq('id', authUserId)
        .maybeSingle();

      if (error || !row) return null;
      const publicUser = rowToPublicUser(row as SupabaseUserRow, '');
      await sessionStore.set(publicUser.id);
      return publicUser;
    } catch {
      return null;
    }
  },

  async updateProfile(
    userId: string,
    patch: { name?: string; phone?: string; email?: string },
  ): Promise<PublicUser> {
    if (!isSupabaseConfigured) throw ERR.network();
    const name = patch.name?.trim();
    if (name && name.length < 3) throw ERR.generic('����� ���� ����.');
    const phone = patch.phone?.trim();
    if (phone && !isValidPhone(phone)) throw ERR.generic('��� ���� ������ ��� ����.');
    const email = patch.email?.trim();
    if (email && !isValidEmail(email)) throw ERR.generic('������ ���������� ��� ����.');

    try {
      const { data, error } = await supabase
        .from('users')
        .update({
          ...(name ? { full_name: name } : {}),
          ...(email ? { email } : {}),
        })
        .eq('id', userId)
        .select('id, email, full_name, role, created_at')
        .single();

      if (error || !data) throw ERR.server();
      return rowToPublicUser(data as SupabaseUserRow, phone ?? '');
    } catch (e) {
      if (e instanceof Error && 'code' in e) throw e;
      throw ERR.network();
    }
  },

  async changePassword(userId: string, current: string, next: string): Promise<void> {
    const err = passwordError(next);
    if (err) throw ERR.generic(err);
    if (!current) throw ERR.generic('���� ����� ���� ������ �������.');
    if (!isSupabaseConfigured) throw ERR.network();

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentEmail = sessionData.session?.user?.email;
      if (!currentEmail) throw ERR.unauthorized();

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: current,
      });
      if (signInError) throw ERR.generic('���� ������ ������� ��� �����.');

      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw ERR.generic(updateError.message);
      void userId;
    } catch (e) {
      if (e instanceof Error && 'code' in e) throw e;
      throw ERR.network();
    }
  },
};
