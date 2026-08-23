'use client';

import { useEffect, useState } from 'react';
import { Upload, Check, X, Loader2 } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseStorage, getFirebaseAuth } from '@/lib/firebase/client';

interface KycUploaderProps {
  uid: string;
  fieldName: 'bookBankURL' | 'idCardURL' | 'slipURL';
  label: string;
  hint: string;
  initialUrl?: string | null;
  /** โฟลเดอร์ใน Storage (default: kyc) */
  folder?: string;
}

/** อัปโหลดไฟล์ขึ้น Firebase Storage — คืน URL ใส่ hidden input */
export default function KycFileUploader({ uid, fieldName, label, hint, initialUrl, folder = 'kyc' }: KycUploaderProps) {
  const [url, setUrl] = useState<string>(initialUrl || '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [authUid, setAuthUid] = useState<string | null>(null);

  // รอ auth restore — ป้องกันอัปโหลดแบบไม่มี token (403)
  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (u) => {
      setAuthUid(u?.uid ?? null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      if (folder === 'payout-slips') {
        const formData = new FormData();
        formData.append('payoutId', uid);
        formData.append('file', file);
        const response = await fetch('/api/admin/payout-slip', { method: 'POST', body: formData });
        const result = await response.json() as { url?: string; error?: string };
        if (!response.ok || !result.url) throw new Error(result.error || 'อัปโหลดไม่สำเร็จ');
        setUrl(result.url);
        return;
      }
      const auth = getFirebaseAuth();
      const ext = file.name.split('.').pop() || 'jpg';
      const storageRef = ref(getFirebaseStorage(), `${folder}/${uid}/${fieldName}-${Date.now()}.${ext}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      setUrl(downloadUrl);
    } catch (err: any) {
      setError(err?.message || 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  const authMismatch = authReady && authUid !== null && authUid !== uid;

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-800">{label}</p>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      <input type="hidden" name={fieldName} value={url} />
      {!authReady ? (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> กำลังตรวจสอบการเข้าสู่ระบบ...
        </div>
      ) : authMismatch ? (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-600">
          กรุณาเข้าสู่ระบบด้วยบัญชีของครูเจ้าของโปรไฟล์
        </p>
      ) : (
        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 transition-colors hover:border-pink-300 hover:bg-pink-50">
          <Upload className="h-4 w-4" />
          {uploading ? 'กำลังอัปโหลด...' : url ? 'เปลี่ยนไฟล์' : 'เลือกไฟล์ (JPG/PNG/PDF, ≤10MB)'}
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
      )}
      {uploading && <div className="mt-2 h-1.5 animate-pulse rounded-full bg-pink-200" />}
      {error && <p className="mt-2 flex items-center gap-1 text-xs text-red-600"><X className="h-3 w-3" /> {error}</p>}
      {url && !uploading && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-600">
          <Check className="h-3.5 w-3.5" /> แนบไฟล์เรียบร้อย
          <a href={url} target="_blank" rel="noreferrer" className="ml-1 underline">ดูไฟล์</a>
        </p>
      )}
    </div>
  );
}
