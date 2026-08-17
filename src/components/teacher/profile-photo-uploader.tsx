'use client';

import { useRef, useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirebaseStorage } from '@/lib/firebase/client';
import { Camera, Loader2, Trash2, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProfilePhotoUploaderProps {
  userId: string;
  /** ค่าปัจจุบันของ users/{uid}.photoURL */
  currentPhotoURL?: string;
}

export function ProfilePhotoUploader({ userId, currentPhotoURL }: ProfilePhotoUploaderProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(currentPhotoURL || null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('ไฟล์ต้องไม่เกิน 5 MB');
      return;
    }

    setUploading(true);
    try {
      const storage = getFirebaseStorage();
      const ext = file.name.split('.').pop() || 'jpg';
      const storageRef = ref(storage, `profile-photos/${userId}/photo-${Date.now()}.${ext}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setPreviewUrl(url);
      setSavedUrl(url);
    } catch (uploadError) {
      console.error('Photo upload failed:', uploadError);
      setError('อัปโหลดรูปไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    setPreviewUrl(null);
    setSavedUrl(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const displayUrl = previewUrl || savedUrl;

  return (
    <div className="flex items-start gap-4">
      {/* Preview */}
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-violet-200 bg-violet-50">
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayUrl} alt="รูปโปรไฟล์" className="h-full w-full object-cover" />
        ) : (
          <ImageOff className="h-7 w-7 text-violet-300" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-700">รูปโปรไฟล์</p>
        <p className="mt-0.5 text-xs text-slate-500">รองรับ JPG, PNG, WebP — ขนาดไม่เกิน 5 MB</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-edu-gradient px-4 py-2 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-0.5 hover:shadow-elevated',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'
            )}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {uploading ? 'กำลังอัปโหลด...' : displayUrl ? 'เปลี่ยนรูป' : 'เลือกไฟล์รูป'}
          </button>
          {displayUrl && (
            <button
              type="button"
              disabled={uploading}
              onClick={handleRemove}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-200 bg-white/70 px-3.5 py-2 text-sm font-bold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              ลบรูป
            </button>
          )}
        </div>

        {error && <p className="mt-2 text-xs font-semibold text-rose-600">⚠ {error}</p>}

        {/* Hidden input — server action อ่านจากที่นี่ (สูงสุด 5MB base64 ไม่เกิน form limit) */}
        <input type="hidden" name="photo_url" value={savedUrl || ''} />
      </div>
    </div>
  );
}
