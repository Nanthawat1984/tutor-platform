import { NextRequest, NextResponse } from 'next/server';
import { getServerStorage } from '@/lib/firebase/server';
import { requireAdmin } from '@/lib/auth/guards';
import { COLLECTIONS } from '@/types/firestore';
import { storagePathFromDownloadUrl } from '@/lib/auth/teacher-verification';

export const runtime = 'nodejs';

const DOCUMENT_FIELDS = {
  'id-card': 'idCardURL',
  'book-bank': 'bookBankURL',
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  let db;
  try {
    ({ db } = await requireAdmin());
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const storage = getServerStorage();
  if (!db || !storage) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const { id, kind } = await params;
  const field = DOCUMENT_FIELDS[kind as keyof typeof DOCUMENT_FIELDS];
  if (!field) return NextResponse.json({ error: 'document_kind_not_supported' }, { status: 400 });

  const userSnap = await db.collection(COLLECTIONS.USERS).doc(id).get();
  if (!userSnap.exists || userSnap.data()?.role !== 'teacher') {
    return NextResponse.json({ error: 'teacher_not_found' }, { status: 404 });
  }

  const value = userSnap.data()?.[field];
  const path = storagePathFromDownloadUrl(typeof value === 'string' ? value : null, id);
  if (!path) return NextResponse.json({ error: 'document_not_available' }, { status: 404 });

  try {
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`;
    const fileRef = storage.bucket(bucketName).file(path);
    const [exists] = await fileRef.exists();
    if (!exists) return NextResponse.json({ error: 'document_not_found' }, { status: 404 });

    const [signedUrl] = await fileRef.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000,
    });
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    console.error('Admin teacher document view error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'document_view_failed' }, { status: 500 });
  }
}
