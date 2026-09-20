import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import { BANK_ACCOUNT, computeFees, generateRef } from '@/lib/payments/config';
import { createPaymentForPackage } from '@/lib/payments/process';
import { createStripeCheckoutSession } from '@/lib/payments/stripe';
import { generateQRDataUrl, buildMockPromptPayPayload } from '@/lib/payments/qr';
import { PROMPTPAY_NUMBER } from '@/lib/payments/config';
import { validateCoupon } from '@/lib/coupons';

// POST /api/packages/purchase { packageId, studentId, method?, couponCode?, useWallet? }
// สร้าง purchase (pending) + payment แล้วคืนช่องทางชำระ (Stripe URL / QR mock / bank details)
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const body = await request.json().catch(() => ({})) as {
    packageId?: string; studentId?: string; method?: string; couponCode?: string; useWallet?: boolean;
  };
  const packageId = String(body.packageId || '').trim();
  const studentId = String(body.studentId || '').trim();
  const method = body.method === 'bank_transfer' ? 'bank_transfer' : 'stripe_checkout';
  const couponCode = String(body.couponCode || '').trim().toUpperCase().slice(0, 32) || null;
  if (!packageId || !studentId) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const pkgSnap = await db.collection(COLLECTIONS.PACKAGES).doc(packageId).get();
  if (!pkgSnap.exists) return NextResponse.json({ error: 'package_not_found' }, { status: 404 });
  const pkg = { id: pkgSnap.id, ...pkgSnap.data() } as any;
  if (pkg.isActive !== true) return NextResponse.json({ error: 'package_inactive' }, { status: 409 });

  const studentSnap = await db.collection(COLLECTIONS.STUDENTS).doc(studentId).get();
  const student = studentSnap.exists ? studentSnap.data() as any : null;
  if (!student || student.parentId !== session.uid) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // กันซื้อซ้ำ: มี active purchase ของแพ็กเกจเดียวกัน + นักเรียนคนเดียวกันอยู่แล้ว
  const existingSnap = await db.collection(COLLECTIONS.PACKAGE_PURCHASES)
    .where('packageId', '==', packageId)
    .where('parentId', '==', session.uid)
    .where('status', '==', 'active')
    .limit(5)
    .get();
  const dup = existingSnap.docs.some((d: any) => {
    const p = d.data();
    return String(p.studentName || '') === String(student.name || '') && Number(p.sessionsRemaining) > 0;
  });
  if (dup) return NextResponse.json({ error: 'already_owned' }, { status: 409 });

  const listAmount = Math.round(Number(pkg.priceTotal) || 0);
  if (listAmount <= 0) return NextResponse.json({ error: 'invalid_price' }, { status: 422 });

  // ส่วนลดคูปอง (ถ้ามี)
  let couponId: string | null = null;
  let discount = 0;
  if (couponCode) {
    const check = await validateCoupon(db, couponCode, listAmount, session.uid);
    if (!check.ok) {
      return NextResponse.json({ error: 'coupon_invalid', reason: check.reason }, { status: 422 });
    }
    couponId = check.coupon.id;
    discount = check.discount;
  }

  // ใช้เครดิต parent wallet ร่วมจ่าย (ถ้าขอ)
  let walletApplied = 0;
  if (body.useWallet) {
    const wSnap = await db.collection(COLLECTIONS.PARENT_WALLETS).doc(session.uid).get();
    const balance = Number(wSnap.data()?.balance) || 0;
    walletApplied = Math.max(0, Math.min(balance, listAmount - discount));
  }

  const amount = Math.max(0, listAmount - discount - walletApplied);
  const { fees, netAmount } = computeFees(amount);

  // สร้าง purchase (pending) ก่อน — เปิดใช้จริงตอน payment=paid
  const purchaseRef = await db.collection(COLLECTIONS.PACKAGE_PURCHASES).add({
    packageId,
    packageTitle: pkg.title,
    parentId: session.uid,
    parentName: session.displayName,
    teacherId: pkg.teacherId,
    courseId: pkg.courseId,
    courseTitle: pkg.courseTitle,
    studentId,
    studentName: student.name,
    sessionsTotal: Number(pkg.sessionsTotal) || 0,
    sessionsUsed: 0,
    sessionsRemaining: Number(pkg.sessionsTotal) || 0,
    releasedSessions: 0,
    releasedNetTotal: 0,
    taxWithheldTotal: 0,
    perSessionNet: 0,
    amount,
    fees,
    netAmount,
    currency: 'THB',
    status: 'pending',
    paymentId: null,
    lowCreditNotified: false,
    depletedNotified: false,
    expiresAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // จ่ายครบด้วยเครดิต+คูปอง (ยอดเหลือ 0) → เปิดใช้ทันที ไม่ต้องผ่าน gateway
  if (amount <= 0) {
    const { markPackagePaymentPaid } = await import('@/lib/payments/process');
    // สร้าง payment 0 บาทเพื่อเก็บ audit trail แล้ว mark paid ทันที
    const pay = await createPaymentForPackage(db, {
      packageId,
      purchaseId: purchaseRef.id,
      parentId: session.uid,
      parentName: session.displayName,
      teacherId: pkg.teacherId,
      courseTitle: `แพ็กเกจ: ${pkg.title}`,
      studentName: student.name,
      amount: 0,
      method: 'stripe_checkout',
      couponCode,
      couponId,
      discountAmount: discount,
      walletApplied,
    });
    await markPackagePaymentPaid(db, pay.id, { transactionId: `wallet_${purchaseRef.id}` });
    await db.collection(COLLECTIONS.PACKAGES).doc(packageId).update({
      soldCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, purchaseId: purchaseRef.id, paymentId: pay.id, paidByCredit: true });
  }

  const pay = await createPaymentForPackage(db, {
    packageId,
    purchaseId: purchaseRef.id,
    parentId: session.uid,
    parentName: session.displayName,
    teacherId: pkg.teacherId,
    courseTitle: `แพ็กเกจ: ${pkg.title}`,
    studentName: student.name,
    amount,
    method,
    couponCode,
    couponId,
    discountAmount: discount,
    walletApplied,
  });

  const provider = process.env.PAYMENT_PROVIDER === 'stripe' ? 'stripe' : 'mock';
  let checkoutUrl: string | null = null;
  let qrDataUrl: string | null = null;
  let bankDetails: { bankName: string; accountName: string; accountNumber: string; ref: string } | null = null;
  const ref = generateRef('TF');
  let providerRef = `manual_${ref}`;

  try {
    if (method === 'stripe_checkout' && provider === 'stripe') {
      const checkout = await createStripeCheckoutSession({
        amount,
        bookingId: `package:${purchaseRef.id}`,
        paymentId: pay.id,
        courseTitle: `แพ็กเกจ: ${pkg.title}`,
        studentName: student.name,
        successPath: `/packages/${purchaseRef.id}/success?paymentId=${encodeURIComponent(pay.id)}&session_id={CHECKOUT_SESSION_ID}`,
        cancelPath: `/packages/${purchaseRef.id}?paymentId=${encodeURIComponent(pay.id)}&cancelled=1`,
      });
      checkoutUrl = checkout.url;
      providerRef = checkout.id;
    } else if (method === 'bank_transfer') {
      bankDetails = { ...BANK_ACCOUNT, ref };
    } else {
      qrDataUrl = await generateQRDataUrl(buildMockPromptPayPayload({ ref, amount, number: PROMPTPAY_NUMBER }));
      providerRef = `mock_${ref}`;
    }
  } catch (error) {
    console.error('package checkout failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'gateway_error' }, { status: 502 });
  }

  await db.collection(COLLECTIONS.PAYMENTS).doc(pay.id).update({
    provider,
    providerRef,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    ok: true,
    purchaseId: purchaseRef.id,
    paymentId: pay.id,
    amount,
    listAmount,
    discount,
    walletApplied,
    couponCode,
    checkoutUrl,
    qrDataUrl,
    bankDetails,
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
