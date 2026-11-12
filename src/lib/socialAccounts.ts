import { storage } from '../store/mmkv';

export interface SocialAccountOption {
  id: string;
  label: string;
  channel: string;
}

/** Social accounts cached by the sync (`fetchAndCacheFilterOptions`), as simple options */
export function getCachedAccounts(): SocialAccountOption[] {
  try {
    const raw = storage.getString('cached_social_accounts');
    const accs: any[] = raw ? JSON.parse(raw) : [];
    const out: SocialAccountOption[] = [];
    for (const acc of accs) {
      const id = acc.phoneNumberId || acc.phone_number_id || acc.accountId || acc.account_id || acc._id;
      const label = acc.name || acc.phoneNumber || acc.phoneNumberId || acc.accountLabel || acc.accountName;
      if (id && label) out.push({ id: String(id), label: String(label), channel: String(acc.channel || 'whatsapp').toLowerCase() });
    }
    return out;
  } catch {
    return [];
  }
}

export const getWhatsAppAccounts = () => getCachedAccounts().filter((a) => a.channel === 'whatsapp');
