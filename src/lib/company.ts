// Company profile for tax documents — Firestore settings/company first,
// environment fallback second. Keeps 50 ทวิ / ภ.ง.ด.53 printable even before
// an admin fills the /admin/company form.
import { getServerDb } from '@/lib/firebase/server';

export interface CompanyProfile {
  name: string;
  taxId: string;
  address: string;
  branch: string;
}

const ENV_FALLBACK: CompanyProfile = {
  name: process.env.COMPANY_NAME || 'บริษัท TutorFinder จำกัด',
  taxId: process.env.COMPANY_TAX_ID || '',
  address: process.env.COMPANY_ADDRESS || '',
  branch: process.env.COMPANY_BRANCH || 'สำนักงานใหญ่',
};

let cache: { at: number; value: CompanyProfile } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getCompanyProfile(): Promise<CompanyProfile> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const db = getServerDb();
    if (!db) return ENV_FALLBACK;
    const snap = await db.collection('settings').doc('company').get();
    if (snap.exists) {
      const s = snap.data() as any;
      const value: CompanyProfile = {
        name: s.name || ENV_FALLBACK.name,
        taxId: s.taxId || ENV_FALLBACK.taxId,
        address: s.address || ENV_FALLBACK.address,
        branch: s.branch || ENV_FALLBACK.branch,
      };
      cache = { at: Date.now(), value };
      return value;
    }
  } catch { /* fall through to env */ }
  return ENV_FALLBACK;
}
