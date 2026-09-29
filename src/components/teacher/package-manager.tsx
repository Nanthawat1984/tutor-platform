'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackagePlus, Power, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';

interface CourseOption {
  id: string;
  title: string;
  pricePerSession: number;
}

interface PackageItem {
  id: string;
  title: string;
  courseTitle: string;
  sessionsTotal: number;
  priceTotal: number;
  discountPercent: number;
  isActive: boolean;
  soldCount: number;
}

interface PackageManagerProps {
  courses: CourseOption[];
  packages: PackageItem[];
}

const ERROR_LABELS: Record<string, string> = {
  invalid_input: 'ข้อมูลไม่ครบ (ต้องมีชื่อ 2-50 ครั้ง และราคารวมมากกว่า 0)',
  course_not_found: 'ไม่พบคอร์สที่เลือก',
  forbidden: 'ไม่มีสิทธิ์จัดการแพ็กเกจนี้',
  no_discount: 'ราคาแพ็กเกจต้องถูกกว่าราคาเดี่ยว × จำนวนครั้ง (ต้องมีส่วนลด)',
  unauthorized: 'กรุณาเข้าสู่ระบบใหม่',
  server_not_configured: 'ระบบยังไม่พร้อมใช้งาน',
};

function togglePackage(id: string, nextActive: boolean): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PATCH', `/api/packages/${id}`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = () => {
      let data: any = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { /* ignore */ }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300 && data.ok !== false, error: data.error });
    };
    xhr.onerror = () => resolve({ ok: false, error: 'network' });
    xhr.send(JSON.stringify({ isActive: nextActive }));
  });
}

export function PackageManager({ courses, packages }: PackageManagerProps) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(courses[0]?.id || '');
  const [title, setTitle] = useState('');
  const [sessionsTotal, setSessionsTotal] = useState('10');
  const [priceTotal, setPriceTotal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === courseId),
    [courses, courseId],
  );
  const singlePrice = selectedCourse?.pricePerSession || 0;
  const sessions = Math.max(0, Math.round(Number(sessionsTotal) || 0));
  const listTotal = singlePrice * sessions;
  const price = Math.max(0, Math.round(Number(priceTotal) || 0));
  const discountPercent = listTotal > 0 && price > 0
    ? Math.max(0, Math.round(((listTotal - price) / listTotal) * 100))
    : 0;
  const priceValid = price > 0 && listTotal > 0 && price < listTotal;

  async function handleCreate() {
    if (submitting) return;
    if (!courseId) { setFormError('กรุณาเลือกคอร์สก่อน'); return; }
    if (!title.trim()) { setFormError('กรุณาตั้งชื่อแพ็กเกจ'); return; }
    if (!priceValid) {
      setFormError(`ราคารวมต้องถูกกว่า ${listTotal.toLocaleString()} บาท (ราคาเดี่ยว ${singlePrice.toLocaleString()} × ${sessions} ครั้ง)`);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          title: title.trim(),
          sessionsTotal: sessions,
          priceTotal: price,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setSuccess(`สร้างแพ็กเกจ "${title.trim()}" เรียบร้อย — เปิดขายแล้ว`);
        setTitle('');
        setPriceTotal('');
        router.refresh();
      } else {
        setFormError(ERROR_LABELS[data.error || ''] || 'สร้างแพ็กเกจไม่สำเร็จ ลองใหม่อีกครั้ง');
      }
    } catch {
      setFormError('เครือข่ายขัดข้อง ลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(pkg: PackageItem) {
    if (togglingId) return;
    const nextActive = !pkg.isActive;
    const verb = nextActive ? 'เปิดขาย' : 'ปิดขาย';
    if (!window.confirm(`${verb}แพ็กเกจ "${pkg.title}"?${nextActive ? '' : '\nผู้ปกครองจะซื้อไม่ได้ แต่แพ็กเกจที่ซื้อไปแล้วยังใช้ได้ตามปกติ'}`)) {
      return;
    }
    setTogglingId(pkg.id);
    try {
      const res = await togglePackage(pkg.id, nextActive);
      if (!res.ok) {
        window.alert(ERROR_LABELS[res.error || ''] || 'เปลี่ยนสถานะไม่สำเร็จ ลองใหม่อีกครั้ง');
        return;
      }
      router.refresh();
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── สร้างแพ็กเกจใหม่ ── */}
      <div className="rounded-2xl border border-pink-100 bg-white p-6 shadow-card">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <PackagePlus className="h-5 w-5 text-pink-600" />
          สร้างแพ็กเกจใหม่
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          ผู้ปกครองจ่ายก้อนเดียว ได้เครดิตเรียนหลายครั้ง — ราคาแพ็กเกจต้องมีส่วนลดจากราคาเดี่ยว
        </p>

        {courses.length === 0 ? (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            คุณยังไม่มีคอร์สที่เปิดสอน — สร้างคอร์สก่อนจึงจะทำแพ็กเกจได้
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Select
              label="คอร์ส"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              options={courses.map((c) => ({ value: c.id, label: `${c.title} (${c.pricePerSession.toLocaleString()} บ./ครั้ง)` }))}
            />
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">ชื่อแพ็กเกจ</span>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="เช่น แพ็ก 10 ครั้ง พิเศษ"
                maxLength={120}
              />
            </label>
            <Input
              label="จำนวนครั้ง (2-50)"
              type="number"
              min={2}
              max={50}
              value={sessionsTotal}
              onChange={(e) => setSessionsTotal(e.target.value)}
            />
            <Input
              label="ราคารวมทั้งแพ็ก (บาท)"
              type="number"
              min={1}
              value={priceTotal}
              onChange={(e) => setPriceTotal(e.target.value)}
              placeholder={listTotal > 0 ? `น้อยกว่า ${listTotal.toLocaleString()}` : undefined}
            />
          </div>
        )}

        {singlePrice > 0 && sessions >= 2 && price > 0 && (
          <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${priceValid ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>
            {priceValid ? (
              <>
                <span className="font-bold">ส่วนลด {discountPercent}%</span>
                {' '}— ราคาปกติ {listTotal.toLocaleString()} บ. → ขาย {price.toLocaleString()} บ.
                <span className="text-emerald-700"> (เฉลี่ย {Math.round(price / sessions).toLocaleString()} บ./ครั้ง)</span>
              </>
            ) : (
              <span className="font-semibold">ราคารวมต้องถูกกว่าราคาเดี่ยว × จำนวนครั้ง ({listTotal.toLocaleString()} บาท)</span>
            )}
          </div>
        )}

        {formError && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{formError}</p>}
        {success && <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</p>}

        {courses.length > 0 && (
          <Button className="mt-4" onClick={handleCreate} isLoading={submitting}>
            สร้างแพ็กเกจ
          </Button>
        )}
      </div>

      {/* ── รายการแพ็กเกจของฉัน ── */}
      <div className="rounded-2xl border border-pink-100 bg-white p-6 shadow-card">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <RotateCcw className="h-5 w-5 text-pink-600" />
          แพ็กเกจของฉัน ({packages.length})
        </h2>

        {packages.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            ยังไม่มีแพ็กเกจ — สร้างแพ็กเกจแรกด้านบนเพื่อให้ผู้ปกครองซื้อได้
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white/60 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{pkg.title}</span>
                    {pkg.isActive
                      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">เปิดขาย</span>
                      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">ปิดขาย</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{pkg.courseTitle}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {pkg.sessionsTotal} ครั้ง • {pkg.priceTotal.toLocaleString()} บ. (ส่วนลด {pkg.discountPercent}%) • ขายแล้ว {pkg.soldCount} แพ็ก
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={pkg.isActive ? 'outline' : 'success'}
                  onClick={() => handleToggle(pkg)}
                  disabled={togglingId === pkg.id}
                  className={pkg.isActive ? 'border-slate-200 text-slate-600' : ''}
                >
                  <Power className="h-3.5 w-3.5" />
                  {pkg.isActive ? 'ปิดขาย' : 'เปิดขาย'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
