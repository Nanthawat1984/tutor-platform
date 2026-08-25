'use client';

import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';
import { Camera, Check, ImageOff, Loader2, Trash2, X } from 'lucide-react';
import { getFirebaseAuth, getFirebaseStorage } from '@/lib/firebase/client';
import {
  STUDENT_PHOTO_MAX_BYTES,
  STUDENT_PHOTO_MIME_TYPES,
} from '@/lib/students/student-photo';

interface StudentPhotoUploaderProps {
  parentId: string;
  studentId: string;
  initialPath?: string | null;
}

export function StudentPhotoUploader({ parentId, studentId, initialPath }: StudentPhotoUploaderProps) {
  const [path, setPath] = useState(initialPath || '');
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [authUid, setAuthUid] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (user) => {
      setAuthUid(user?.uid || null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  async function handleFile(file: File) {
    setError('');
    if (!(STUDENT_PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError('กรุณาเลือกไฟล์ JPG, PNG หรือ WebP เท่านั้น');
      return;
    }
    if (file.size > STUDENT_PHOTO_MAX_BYTES) {
      setError('ไฟล์ต้องมีขนาดไม่เกิน 5 MB');
      return;
    }

    setUploading(true);
    try {
      const auth = getFirebaseAuth();
      if (!auth.currentUser || auth.currentUser.uid !== parentId) {
        throw new Error('กรุณาเข้าสู่ระบบด้วยบัญชีผู้ปกครองเจ้าของโปรไฟล์');
      }

      const extension = file.type === 'image/jpeg'
        ? 'jpg'
        : file.type === 'image/png'
          ? 'png'
          : 'webp';
      const storageRef = ref(
        getFirebaseStorage(),
        `student-photos/${studentId}/student-photo-${Date.now()}.${extension}`,
      );
      await uploadBytes(storageRef, file, { contentType: file.type });

      const previousPath = path;
      setPath(storageRef.fullPath);
      setLocalPreview(URL.createObjectURL(file));

      // Remove only files uploaded during this unsaved edit. Keep the
      // previously saved photo until the server action commits the change.
      if (previousPath && previousPath !== initialPath) {
        await deleteObject(ref(getFirebaseStorage(), previousPath)).catch(() => undefined);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    if (!path) return;
    setError('');
    setUploading(true);
    const pathToRemove = path;
    const previewToRemove = localPreview;
    try {
      if (pathToRemove !== initialPath) {
        await deleteObject(ref(getFirebaseStorage(), pathToRemove));
      }
      setPath('');
      setLocalPreview(null);
    } catch {
      setError('ลบรูปไม่สำเร็จ กรุณาลองอีกครั้ง');
      setPath(pathToRemove);
      setLocalPreview(previewToRemove);
    } finally {
      setUploading(false);
    }
  }

  const displayUrl = localPreview || (path ? `/api/students/${encodeURIComponent(studentId)}/photo` : null);
  const authMismatch = authReady && authUid !== parentId;

  return (
    <div className="rounded-xl border border-pink-100 bg-pink-50/30 p-3">
      <p className="text-sm font-semibold text-slate-700">รูปหน้าลูก</p>
      <p className="mt-0.5 text-xs text-slate-500">
        ครูที่มีการจองเรียนกับเด็กคนนี้เท่านั้นจึงจะเห็นรูป · JPG/PNG/WebP ไม่เกิน 5 MB
      </p>
      <input type="hidden" name="photo_path" value={path} />

      <div className="mt-3 flex items-start gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-pink-200 bg-white">
          {displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayUrl} alt={`รูปของนักเรียน ${studentId}`} className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="h-7 w-7 text-pink-200" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {!authReady ? (
            <div className="flex min-h-[40px] items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> กำลังตรวจสอบการเข้าสู่ระบบ...
            </div>
          ) : authMismatch ? (
            <p className="rounded-lg bg-red-50 p-3 text-xs text-red-600">
              กรุณาเข้าสู่ระบบด้วยบัญชีผู้ปกครองเจ้าของโปรไฟล์
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                  event.currentTarget.value = '';
                }}
                disabled={uploading}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-edu-gradient px-4 py-2 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-0.5 hover:shadow-elevated disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {uploading ? 'กำลังอัปโหลด...' : displayUrl ? 'เปลี่ยนรูป' : 'เลือกรูป'}
              </button>
              {displayUrl && (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => void removePhoto()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-200 bg-white/70 px-3.5 py-2 text-sm font-bold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" /> ลบรูป
                </button>
              )}
            </div>
          )}

          {path && !uploading && (
            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-600">
              <Check className="h-3.5 w-3.5" /> เลือกรูปแล้ว กด “บันทึก” เพื่อยืนยัน
            </p>
          )}
          {error && <p className="mt-2 flex items-center gap-1 text-xs text-red-600"><X className="h-3 w-3" /> {error}</p>}
        </div>
      </div>
    </div>
  );
}
