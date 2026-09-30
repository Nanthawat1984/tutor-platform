'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ImageOff, Check, Megaphone, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ANNOUNCEMENT_CATEGORIES, ANNOUNCEMENT_MAX_IMAGES } from '@/lib/announcements';
import {
  ANNOUNCEMENT_IMAGE_ACCEPT,
  ANNOUNCEMENT_IMAGE_TYPES,
  ANNOUNCEMENT_IMAGES_TOTAL_MAX_BYTES,
  compressImage,
  formatBytes,
} from '@/lib/image-compress';
import { createAnnouncement, updateAnnouncement } from '@/app/admin/announcements/actions';

const MAX_INPUT_BYTES = 5 * 1024 * 1024;

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100';

type Picked = { file: File; preview: string };

export function AnnouncementForm({
  mode,
  announcementId,
  defaults = {},
  existingImages = [],
  submitLabel,
}: {
  mode: 'create' | 'edit';
  announcementId?: string;
  defaults?: { title?: string; body?: string; audience?: string; category?: string; linkUrl?: string; isPinned?: boolean };
  existingImages?: { url: string }[];
  submitLabel: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const previewsRef = useRef<string[]>([]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const totalBytes = picked.reduce((sum, p) => sum + p.file.size, 0);

  // คืน memory ของ object URL ทุกตัวเมื่อ component ถูกถอดออก
  useEffect(() => () => {
    for (const url of previewsRef.current) URL.revokeObjectURL(url);
    previewsRef.current = [];
  }, []);

  function trackPreview(url: string) {
    previewsRef.current.push(url);
  }

  function dropPreview(url: string) {
    URL.revokeObjectURL(url);
    previewsRef.current = previewsRef.current.filter((u) => u !== url);
  }

  function clearPicked() {
    for (const p of picked) URL.revokeObjectURL(p.preview);
    previewsRef.current = [];
    setPicked([]);
  }

  async function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = ''; // เลือกไฟล์เดิมซ้ำได้
    if (chosen.length === 0) return;
    setError('');
    setSuccess('');

    const room = ANNOUNCEMENT_MAX_IMAGES - picked.length;
    if (room <= 0) {
      setError(`เลือกได้สูงสุด ${ANNOUNCEMENT_MAX_IMAGES} รูป`);
      return;
    }

    const accepted = chosen.slice(0, room);
    const tooBig = accepted.find((f) => f.size > MAX_INPUT_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" ใหญ่เกิน 5 MB — กรุณาเลือกรูปที่เล็กกว่า`);
      return;
    }
    const wrongType = accepted.find((f) => !ANNOUNCEMENT_IMAGE_TYPES.includes(f.type as 'image/jpeg'));
    if (wrongType) {
      setError(`"${wrongType.name}" ไม่ใช่ไฟล์รูป — รองรับ JPG, PNG, WebP เท่านั้น`);
      return;
    }

    setCompressing(true);
    const added: Picked[] = [];
    let bytes = totalBytes;
    let skippedOverSize = false;

    for (const original of accepted) {
      const file = await compressImage(original);
      if (bytes + file.size > ANNOUNCEMENT_IMAGES_TOTAL_MAX_BYTES) {
        skippedOverSize = true;
        break;
      }
      bytes += file.size;
      const preview = URL.createObjectURL(file);
      trackPreview(preview);
      added.push({ file, preview });
    }
    setCompressing(false);

    if (added.length === 0) {
      setError(`รูปที่เลือกใหญ่เกินไป — รวมกันได้ไม่เกิน ${formatBytes(ANNOUNCEMENT_IMAGES_TOTAL_MAX_BYTES)}`);
      return;
    }
    setPicked((prev) => [...prev, ...added]);

    if (skippedOverSize || accepted.length < chosen.length) {
      setError(
        skippedOverSize
          ? `บางรูปถูกข้ามเพราะรวมกันเกิน ${formatBytes(ANNOUNCEMENT_IMAGES_TOTAL_MAX_BYTES)}`
          : `เลือกได้สูงสุด ${ANNOUNCEMENT_MAX_IMAGES} รูป`
      );
    }
  }

  function removeAt(index: number) {
    dropPreview(picked[index].preview);
    setPicked((prev) => prev.filter((_, i) => i !== index));
    setError('');
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    setError('');
    setSuccess('');
    setSubmitting(true);

    const fd = new FormData(form);
    fd.delete('image');
    for (const p of picked) fd.append('image', p.file, p.file.name);

    try {
      if (mode === 'edit') await updateAnnouncement(fd);
      else await createAnnouncement(fd);
      clearPicked();
      if (mode === 'create') form.reset();
      setSuccess(mode === 'edit' ? 'บันทึกการแก้ไขเรียบร้อยแล้ว' : 'เผยแพร่ประกาศเรียบร้อยแล้ว');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      {announcementId && <input type="hidden" name="id" value={announcementId} />}

      <div>
        <label className="mb-1 block text-xs font-bold text-slate-600">หัวข้อ *</label>
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={defaults.title || ''}
          placeholder="เช่น โปรโมชันแพ็กเกจเรียน ลดสูงสุด 20%"
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-slate-600">เนื้อหา *</label>
        <textarea
          name="body"
          required
          maxLength={2000}
          rows={mode === 'edit' ? 6 : 4}
          defaultValue={defaults.body || ''}
          placeholder="รายละเอียดข่าว/โปรโมชัน..."
          className={inputClass}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">กลุ่มเป้าหมาย</label>
          <select name="audience" defaultValue={defaults.audience || 'all'} className={inputClass}>
            <option value="all">ทุกคน</option>
            <option value="parent">ผู้ปกครอง</option>
            <option value="teacher">ครู</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">หมวด</label>
          <select name="category" defaultValue={defaults.category || 'general'} className={inputClass}>
            {ANNOUNCEMENT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">ลิงก์เพิ่มเติม (ไม่บังคับ)</label>
          <input name="linkUrl" defaultValue={defaults.linkUrl || ''} placeholder="/packages" className={inputClass} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-slate-600">
          รูปประกอบ (ไม่บังคับ — เลือกได้หลายรูป, JPG/PNG/WebP ไม่เกิน 5MB ต่อรูป, สูงสุด {ANNOUNCEMENT_MAX_IMAGES} รูป)
        </label>

        {existingImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {existingImages.map((img, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={img.url || i}
                src={img.url}
                alt={`รูปที่บันทึกไว้ (${i + 1})`}
                className="h-20 rounded-lg border border-slate-200 object-cover"
              />
            ))}
          </div>
        )}

        <input
          type="file"
          multiple
          onChange={onPickFiles}
          disabled={compressing || submitting || picked.length >= ANNOUNCEMENT_MAX_IMAGES}
          accept={ANNOUNCEMENT_IMAGE_ACCEPT}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-pink-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-pink-700"
        />

        <p className="mt-1 text-[11px] text-slate-400">
          ระบบจะย่อรูปให้อัตโนมัติก่อนอัปโหลด เพื่อไม่ให้ไฟล์ใหญ่เกินลิมิตของระบบ
          {mode === 'edit' && ' · ถ้าเลือกไฟล์ใหม่ รูปเดิมทั้งหมดจะถูกแทนที่ (ไม่เลือก = คงรูปเดิม)'}
        </p>

        {picked.length > 0 && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-2">
              {picked.map((p, i) => (
                <div key={p.preview} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- object URL ชั่วคราวระหว่างเลือกไฟล์ */}
                  <img src={p.preview} alt={p.file.name} className="h-20 w-20 rounded-lg border border-slate-200 object-cover" />
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    aria-label={`นำรูป ${p.file.name} ออก`}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm transition-colors hover:bg-rose-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">
              เลือกแล้ว {picked.length}/{ANNOUNCEMENT_MAX_IMAGES} รูป · รวม {formatBytes(totalBytes)}
            </p>
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="isPinned"
          defaultChecked={defaults.isPinned === true}
          className="h-4 w-4 rounded border-slate-300 text-pink-600"
        />
        ปักหมุดไว้บนสุดของแดชบอร์ด
      </label>

      {error && (
        <p className="flex items-start gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          <ImageOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {success && (
        <p className="flex items-start gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {success}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          isLoading={submitting || compressing}
          className="inline-flex items-center gap-2"
        >
          {mode === 'edit' ? <Megaphone className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {submitLabel}
        </Button>
        {compressing && <span className="text-xs text-slate-500">กำลังย่อรูป...</span>}
      </div>
    </form>
  );
}
