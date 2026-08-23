'use client';

import { useEffect, useState } from 'react';
import { Check, FileImage, Loader2, Trash2, Upload, X } from 'lucide-react';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, getFirebaseStorage } from '@/lib/firebase/client';

interface ParentIdCardUploaderProps {
  uid: string;
  initialPath?: string | null;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function ParentIdCardUploader({ uid, initialPath }: ParentIdCardUploaderProps) {
  const [path, setPath] = useState(initialPath || '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [authUid, setAuthUid] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (user) => {
      setAuthUid(user?.uid || null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  async function handleFile(file: File) {
    setError('');
    if (!(file.type.startsWith('image/') || file.type === 'application/pdf')) {
      setError('กรุณาเลือกไฟล์รูปภาพหรือ PDF เท่านั้น');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('ไฟล์ต้องมีขนาดไม่เกิน 10 MB');
      return;
    }

    setUploading(true);
    try {
      const auth = getFirebaseAuth();
      if (!auth.currentUser || auth.currentUser.uid !== uid) {
        throw new Error('กรุณาเข้าสู่ระบบด้วยบัญชีผู้ปกครองเจ้าของโปรไฟล์');
      }

      const extension = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
      const storageRef = ref(getFirebaseStorage(), `parent-kyc/${uid}/id-card-${Date.now()}.${extension}`);
      await uploadBytes(storageRef, file, {
        contentType: file.type || 'application/octet-stream',
      });
      setPath(storageRef.fullPath);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'อัปโหลดบัตรประชาชนไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  async function removeFile() {
    if (!path) return;
    setError('');
    setUploading(true);
    try {
      await deleteObject(ref(getFirebaseStorage(), path));
      setPath('');
    } catch {
      setError('ลบไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setUploading(false);
    }
  }

  const authMismatch = authReady && authUid !== uid;

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-800">บัตรประชาชน</p>
      <p className="mt-0.5 text-xs text-slate-500">
        ใช้สำหรับยืนยันตัวตนกับบริษัทเท่านั้น ไม่แสดงบนโปรไฟล์สาธารณะ · JPG/PNG/PDF ไม่เกิน 10 MB
      </p>
      <input type="hidden" name="id_card_path" value={path} />

      {!authReady ? (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> กำลังตรวจสอบการเข้าสู่ระบบ...
        </div>
      ) : authMismatch ? (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-600">
          กรุณาเข้าสู่ระบบด้วยบัญชีผู้ปกครองเจ้าของโปรไฟล์
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl bg-edu-gradient px-4 py-2 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-0.5 hover:shadow-elevated">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'กำลังอัปโหลด...' : path ? 'เปลี่ยนไฟล์' : 'แนบไฟล์บัตรประชาชน'}
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.currentTarget.value = '';
              }}
              disabled={uploading}
            />
          </label>
          {path && (
            <button
              type="button"
              onClick={() => void removeFile()}
              disabled={uploading}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-200 bg-white/70 px-3.5 py-2 text-sm font-bold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> ลบไฟล์
            </button>
          )}
        </div>
      )}

      {uploading && <div className="mt-2 h-1.5 animate-pulse rounded-full bg-pink-200" />}
      {path && !uploading && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-600">
          <Check className="h-3.5 w-3.5" /> แนบไฟล์เรียบร้อย <FileImage className="ml-1 h-3.5 w-3.5" />
        </p>
      )}
      {error && <p className="mt-2 flex items-center gap-1 text-xs text-red-600"><X className="h-3 w-3" /> {error}</p>}
    </div>
  );
}
