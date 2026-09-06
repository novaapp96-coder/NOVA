import { latency, localDatabase } from '../data/database';
import { ERR } from '../data/errors';
import { hashPassword, uid, verifyPassword } from '../core/security';
import { isValidEmail, isValidPhone, passwordError } from '../core/logic';
import { sessionStore } from '../core/storage';
import type { PublicUser, User } from '../core/types';

export interface RegisterInput {
  name: string;
  phone: string;
  email?: string;
  password: string;
}

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

/**
 * Auth repository — passwords are salted+hashed before storage, sessions are stored securely.
 * Swap this implementation for a REST/Supabase auth backend without touching the UI.
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

    await latency(380);
    const { salt, hash } = await hashPassword(input.password);

    let created: PublicUser | null = null;
    await localDatabase.mutate((db) => {
      if (db.users.some((u) => u.phone === phone)) throw ERR.phoneExists();
      if (email && db.users.some((u) => u.email?.toLowerCase() === email.toLowerCase()))
        throw ERR.emailExists();
      const user: User = {
        id: uid(),
        name,
        phone,
        email,
        passwordHash: hash,
        salt,
        role: 'customer',
        avatar: null,
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      db.notifications.push({
        id: uid(),
        userId: user.id,
        title: 'أهلًا بكِ في My Cart 💜',
        body: 'حسابكِ أُنشئ بنجاح. جدّدي منتجاتنا واستمتعي بتجربة تسوق سهلة.',
        type: 'system',
        read: false,
        createdAt: new Date().toISOString(),
      });
      created = toPublicUser(user);
    });
    if (!created) throw ERR.server();
    return created;
  },

  async login(identifier: string, password: string): Promise<PublicUser> {
    await latency(340);
    const id = identifier.trim();
    if (!id || !password) throw ERR.generic('يرجى إدخال البيانات كاملة.');

    const db = await localDatabase.read();
    const user = db.users.find(
      (u) => u.phone === id || u.email?.toLowerCase() === id.toLowerCase(),
    );
    // Same generic error for unknown user / wrong password (no account enumeration).
    if (!user) throw ERR.invalidCredentials();

    const ok = await verifyPassword(password, user.salt, user.passwordHash);
    if (!ok) throw ERR.invalidCredentials();

    await sessionStore.set(user.id);
    return toPublicUser(user);
  },

  async logout(): Promise<void> {
    await sessionStore.clear();
  },

  async restoreSession(): Promise<PublicUser | null> {
    const session = await sessionStore.get();
    if (!session?.userId) return null;
    const db = await localDatabase.read();
    const user = db.users.find((u) => u.id === session.userId);
    return user ? toPublicUser(user) : null;
  },

  async updateProfile(
    userId: string,
    patch: { name?: string; phone?: string; email?: string },
  ): Promise<PublicUser> {
    await latency(280);
    let updated: PublicUser | null = null;
    await localDatabase.mutate((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) throw ERR.unauthorized();
      const name = patch.name?.trim() ?? user.name;
      if (name.length < 3) throw ERR.generic('الاسم قصير جدًا.');
      const phone = patch.phone?.trim() ?? user.phone;
      if (!isValidPhone(phone)) throw ERR.generic('رقم هاتف جزائري غير صحيح.');
      const email = patch.email?.trim() || undefined;
      if (email && !isValidEmail(email)) throw ERR.generic('البريد الإلكتروني غير صحيح.');
      if (db.users.some((u) => u.id !== user.id && u.phone === phone))
        throw ERR.phoneExists();
      user.name = name;
      user.phone = phone;
      user.email = email;
      updated = toPublicUser(user);
    });
    if (!updated) throw ERR.server();
    return updated;
  },

  async changePassword(userId: string, current: string, next: string): Promise<void> {
    await latency(300);
    const err = passwordError(next);
    if (err) throw ERR.generic(err);
    if (!current) throw ERR.generic('يرجى إدخال كلمة المرور الحالية.');

    const db = await localDatabase.read();
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw ERR.unauthorized();
    const ok = await verifyPassword(current, user.salt, user.passwordHash);
    if (!ok) throw ERR.generic('كلمة المرور الحالية غير صحيحة.');

    const { salt, hash } = await hashPassword(next);
    await localDatabase.mutate((inner) => {
      const u = inner.users.find((x) => x.id === userId);
      if (!u) throw ERR.unauthorized();
      u.salt = salt;
      u.passwordHash = hash;
    });
  },
};
