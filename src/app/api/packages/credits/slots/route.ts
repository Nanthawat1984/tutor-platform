import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import { slotOptionsForPurchase } from '@/lib/packages';

function getBangkokDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

// GET /api/packages/credits/slots?purchaseId= — ช่วงเวลาที่予約ได้ด้วย credite แพ็กเกจนี้
export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const purchaseId = new URL(request.url).searchParams.get('purchaseId') || '';
  if (!purchaseId) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const purchaseSnap = await db.collection(COLLECTIONS.PACKAGE_PURCHASES).doc(purchaseId).get();
  if (!purchaseSnap.exists) return NextResponse.json({ error: 'purchase_not_found' }, { status: 404 });
  const purchase = { id: purchaseSnap.id, ...purchaseSnap.data() } as any;
  if (purchase.parentId !== session.uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (purchase.status !== 'active' || Number(purchase.sessionsRemaining) < 1) {
    return NextResponse.json({ error: 'insufficient_credit' }, { status: 409 });
  }

  const slots = await slotOptionsForPurchase(db, purchase, getBangkokDateString(), 60);
  return NextResponse.json({
    ok: true,
    remaining: Number(purchase.sessionsRemaining) || 0,
    slots: slots.slice(0, 200),
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';