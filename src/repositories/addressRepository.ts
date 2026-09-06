import { latency, localDatabase } from '../data/database';
import { ERR } from '../data/errors';
import { uid } from '../core/security';
import type { Address, ID } from '../core/types';

export interface AddressInput {
  fullName: string;
  phone: string;
  wilaya: string;
  commune: string;
  street: string;
  notes?: string;
  isDefault?: boolean;
}

/** Address book repository — "عناويني". */
export const addressRepository = {
  async list(userId: ID): Promise<Address[]> {
    await latency(150);
    const db = await localDatabase.read();
    return db.addresses
      .filter((a) => a.userId === userId)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  },

  async save(userId: ID, input: AddressInput, existingId?: ID): Promise<Address[]> {
    if (input.fullName.trim().length < 3) throw ERR.generic('يرجى إدخال الاسم الكامل.');
    if (!/^0[5-7]\d{8}$/.test(input.phone.trim())) throw ERR.generic('رقم هاتف غير صحيح.');
    if (!input.wilaya) throw ERR.generic('يرجى اختيار الولاية.');
    if (!input.commune.trim()) throw ERR.generic('يرجى إدخال البلدية.');
    if (input.street.trim().length < 5) throw ERR.generic('يرجى إدخال العنوان بالتفصيل.');
    await latency(240);
    await localDatabase.mutate((db) => {
      const mine = db.addresses.filter((a) => a.userId === userId);
      if (input.isDefault) mine.forEach((a) => (a.isDefault = false));
      if (existingId) {
        const addr = db.addresses.find((a) => a.id === existingId && a.userId === userId);
        if (!addr) throw ERR.notFound('العنوان');
        Object.assign(addr, {
          fullName: input.fullName.trim(),
          phone: input.phone.trim(),
          wilaya: input.wilaya,
          commune: input.commune.trim(),
          street: input.street.trim(),
          notes: input.notes?.trim(),
          isDefault: !!input.isDefault || mine.length === 0,
        });
      } else {
        db.addresses.push({
          id: uid(),
          userId,
          fullName: input.fullName.trim(),
          phone: input.phone.trim(),
          wilaya: input.wilaya,
          commune: input.commune.trim(),
          street: input.street.trim(),
          notes: input.notes?.trim(),
          isDefault: !!input.isDefault || mine.length === 0,
          createdAt: new Date().toISOString(),
        });
      }
    });
    return this.list(userId);
  },

  async remove(userId: ID, addressId: ID): Promise<Address[]> {
    await latency(180);
    await localDatabase.mutate((db) => {
      db.addresses = db.addresses.filter((a) => !(a.id === addressId && a.userId === userId));
    });
    return this.list(userId);
  },
};
