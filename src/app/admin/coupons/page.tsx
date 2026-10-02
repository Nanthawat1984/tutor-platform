import { redirect } from 'next/navigation';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { Input, Select } from '@/components/ui/input';
import { DashboardLayout, EmptyState, SectionCard, StatCard } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import { requireAdmin } from '@/lib/auth/guards';
import { createCoupon, setCouponActive } from '@/lib/coupons';
import { Tag, Ticket } from 'lucide-react';

// /admin/coupons — ออกคูปองและเปิด/ปิดการใช้งาน
// คูปองถูก consume แบบ atomic ตอน payment สำเร็จ (lib/payments/process)
// คูปอง scope=first_booking ออกให้ลูกค้าใหม่อัตโนมัติ (ดูหน้าการชำระเงินของผู้ปกครอง)

const FILTERS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'active', label: 'ใช้งานอยู่' },
  { value: 'inactive', label: 'ปิดใช้งาน' },
  { value: 'expired', label: 'หมดอายุ' },
  { value: 'first_booking', label: 'ลูกค้าใหม่' },
] as const;

const CREATE_ERRORS: Record<string, string> = {
  invalid_code: 'โค้ดต้องเป็น A-Z 0-9 _ - อย่างน้อย 3 ตัวอักษร',
  invalid_kind: 'เลือกประเภทคูปองไม่ถูกต้อง',
  invalid_value: 'จำนวนเงิน/เปอร์เซ็นต์ต้องมากกว่า 0',
  invalid_percent: 'คูปองเปอร์เซ็นต์ต้องไม่เกิน 100',
  code_taken: 'โค้ดนี้ถูกใช้ไปแล้ว',
  create_failed: 'สร้างคูปองไม่สำเร็จ กรุณาลองใหม่',
};

function millis(value: unknown): number {
  const fn = (value as { toMillis?: () => number } | null | undefined)?.toMillis;
  return typeof fn === 'function' ? fn.call(value) : 0;
}

function couponExpired(coupon: any): boolean {
  const ms = millis(coupon.expiresAt);
  return Boolean(ms) && ms < Date.now();
}

export default async function AdminCouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; created?: string; error?: string; toggled?: string }>;
}) {
  const { db } = await requireAdmin();
  const params = await searchParams;
  const filter = FILTERS.some((f) => f.value === params.filter) ? params.filter! : '';

  const snap = await db.collection('coupons').limit(300).get();
  const all = snap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => (millis(b.createdAt) - millis(a.createdAt)));

  const coupons = all.filter((c: any) => {
    if (filter === 'active') return c.isActive === true && !couponExpired(c);
    if (filter === 'inactive') return c.isActive !== true;
    if (filter === 'expired') return couponExpired(c);
    if (filter === 'first_booking') return c.scope === 'first_booking';
    return true;
  });

  const activeCount = all.filter((c: any) => c.isActive === true && !couponExpired(c)).length;
  const usedTotal = all.reduce((sum: number, c: any) => sum + (Number(c.usedCount) || 0), 0);
  const firstBookingCount = all.filter((c: any) => c.scope === 'first_booking').length;

  async function createCouponAction(formData: FormData) {
    'use server';
    const { db: dbRef } = await requireAdmin();
    try {
      const { id } = await createCoupon(dbRef, {
        code: String(formData.get('code') || ''),
        kind: formData.get('kind') === 'percent' ? 'percent' : 'fixed',
        value: Number(formData.get('value')),
        maxDiscount: Number(formData.get('maxDiscount')) || null,
        minAmount: Number(formData.get('minAmount')) || null,
        usageLimit: Number(formData.get('usageLimit')) || null,
        validDays: Number(formData.get('validDays')) || null,
      });
      redirect(`/admin/coupons?created=${encodeURIComponent(id)}`);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'create_failed';
      redirect(`/admin/coupons?error=${encodeURIComponent(code === 'code_taken' || code.startsWith('invalid_') ? code : 'create_failed')}`);
    }
  }

  async function toggleCouponAction(formData: FormData) {
    'use server';
    const { db: dbRef } = await requireAdmin();
    const couponId = String(formData.get('couponId') || '');
    const nextActive = String(formData.get('nextActive') || '') === 'true';
    if (!couponId) return;
    await setCouponActive(dbRef, couponId, nextActive);
    redirect(`/admin/coupons?filter=${encodeURIComponent(filter)}&toggled=1`);
  }

  const STATS = [
    { label: 'คูปองทั้งหมด', value: all.length, icon: <Ticket className="h-6 w-6" />, iconGradient: 'from-pink-500 to-rose-600' },
    { label: 'ใช้งานอยู่', value: activeCount, icon: <Tag className="h-6 w-6" />, iconGradient: 'from-emerald-500 to-teal-600' },
    { label: 'ถูกใช้ไปแล้ว', value: usedTotal, icon: <Ticket className="h-6 w-6" />, iconGradient: 'from-amber-500 to-orange-500' },
    { label: 'คูปองลูกค้าใหม่', value: firstBookingCount, icon: <Tag className="h-6 w-6" />, iconGradient: 'from-indigo-500 to-blue-600' },
  ];

  return (
    <DashboardLayout title="คูปองส่วนลด" navItems={ADMIN_NAV_ITEMS} role="admin" userName="แอดมิน">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} iconGradient={stat.iconGradient} />
        ))}
      </div>

      {params.created && (
        <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          ✓ สร้างคูปองเรียบร้อย — ผู้ปกครองกรอกโค้ดนี้ที่หน้าชำระเงินได้เลย
        </p>
      )}
      {params.toggled && (
        <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
          ✓ อัปเดตสถานะคูปองแล้ว
        </p>
      )}
      {params.error && (
        <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          ⚠ {CREATE_ERRORS[params.error] || 'ทำรายการไม่สำเร็จ'}
        </p>
      )}

      <div className="mt-6">
        <SectionCard title="ออกคูปองใหม่">
          <form action={createCouponAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input label="โค้ดคูปอง *" name="code" required placeholder="เช่น WELCOME100" />
            <Select
              label="ประเภทส่วนลด *"
              name="kind"
              options={[
                { value: 'fixed', label: 'ลดเงินจำนวนคงที่ (บาท)' },
                { value: 'percent', label: 'ลดเป็นเปอร์เซ็นต์' },
              ]}
              defaultValue="fixed"
            />
            <Input label="มูลค่า *" name="value" type="number" min="1" step="1" required placeholder="เช่น 100 หรือ 10" />
            <Input label="ลดไม่เกิน (บาท)" name="maxDiscount" type="number" min="0" step="1" placeholder="เว้นว่างได้" />
            <Input label="ยอดขั้นต่ำ (บาท)" name="minAmount" type="number" min="0" step="1" placeholder="เช่น 500" />
            <Input label="จำนวนครั้งที่ใช้ได้" name="usageLimit" type="number" min="1" step="1" placeholder="เว้นว่างได้" />
            <Input label="อายุใช้ (วัน)" name="validDays" type="number" min="1" step="1" placeholder="เว้นว่าง = ไม่มีวันหมดอายุ" />
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                <Tag className="h-4 w-4" /> ออกคูปอง
              </Button>
            </div>
          </form>
          <p className="mt-3 text-xs text-slate-500">
            คูปองถูกใช้แบบ atomic ตอนชำระเงินสำเร็จ (consume ครั้งเดียว) — ถ้าผู้ปกครองกดชำระแต่ไม่สำเร็จ คูปองยังไม่ถูกใช้
          </p>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title={`คูปองทั้งหมด (${coupons.length})`}
          action={
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <a
                  key={f.value}
                  href={f.value ? `/admin/coupons?filter=${f.value}` : '/admin/coupons'}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                    filter === f.value ? 'bg-pink-600 text-white' : 'border border-pink-100 bg-white text-slate-600 hover:bg-pink-50'
                  }`}
                >
                  {f.label}
                </a>
              ))}
            </div>
          }
        >
          {coupons.length === 0 ? (
            <EmptyState icon={<Ticket className="h-7 w-7" />} title="ยังไม่มีคูปอง" description="ออกคูปองแรกด้านบนเพื่อเริ่มใช้งาน" />
          ) : (
            <Table headers={['โค้ด', 'ส่วนลด', 'เงื่อนไข', 'การใช้งาน', 'หมดอายุ', 'สถานะ', '']}>
              {coupons.map((c: any) => {
                const expired = couponExpired(c);
                const isActive = c.isActive === true && !expired;
                const value = c.kind === 'percent'
                  ? `${Number(c.value)}%${Number(c.maxDiscount) ? ` (ไม่เกิน ${formatCurrency(Number(c.maxDiscount))})` : ''}`
                  : formatCurrency(Number(c.value) || 0);
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-mono font-bold text-slate-800">{c.code}</p>
                      {c.scope === 'first_booking' && (
                        <p className="text-[11px] text-slate-400">คูปองลูกค้าใหม่{c.ownerUid ? ` • ${String(c.ownerUid).slice(0, 8)}…` : ''}</p>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold text-emerald-700">{value}</TableCell>
                    <TableCell className="text-slate-500">
                      {Number(c.minAmount) > 0 ? `ขั้นต่ำ ${formatCurrency(Number(c.minAmount))}` : 'ไม่มีขั้นต่ำ'}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {Number(c.usedCount) || 0}{Number(c.usageLimit) > 0 ? ` / ${c.usageLimit}` : ' / ไม่จำกัด'}
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {millis(c.expiresAt)
                        ? formatDate(new Date(millis(c.expiresAt)).toISOString().slice(0, 10), 'd MMM yyyy')
                        : 'ไม่มีวันหมดอายุ'}
                    </TableCell>
                    <TableCell>
                      {expired ? <Badge variant="default">หมดอายุ</Badge>
                        : isActive ? <Badge variant="success" dot>ใช้งาน</Badge>
                        : <Badge variant="danger">ปิด</Badge>}
                    </TableCell>
                    <TableCell>
                      <form action={toggleCouponAction}>
                        <input type="hidden" name="couponId" value={c.id} />
                        <input type="hidden" name="nextActive" value={String(!isActive)} />
                        <Button type="submit" size="sm" variant={isActive ? 'outline' : 'primary'}>
                          {isActive ? 'ปิด' : 'เปิด'}
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </Table>
          )}
        </SectionCard>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';