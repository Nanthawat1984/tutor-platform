import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getServerDb, getServerStorage } from '@/lib/firebase/server';
import {
  canTeacherViewStudentPhoto,
  isValidStudentPhotoPath,
  STUDENT_PHOTO_MIME_TYPES,
} from '@/lib/students/student-photo';
import { COLLECTIONS } from '@/types/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = getServerDb();
  const storage = getServerStorage();
  if (!db || !storage) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  }

  const { id } = await params;
  const studentSnap = await db.collection(COLLECTIONS.STUDENTS).doc(id).get();
  if (!studentSnap.exists) return NextResponse.json({ error: 'student_not_found' }, { status: 404 });

  const student = studentSnap.data() || {};
  const userSnap = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  const role = userSnap.data()?.role;
  if (role === 'parent') {
    if (student.parentId !== session.uid) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  } else if (role === 'teacher') {
    const bookingsSnap = await db.collection(COLLECTIONS.BOOKINGS)
      .where('studentId', '==', id)
      .get();
    const bookings = bookingsSnap.docs.map((doc) => doc.data());
    if (!canTeacherViewStudentPhoto(bookings, session.uid, id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const photoPath = typeof student.photoPath === 'string' ? student.photoPath : '';
  if (!isValidStudentPhotoPath(photoPath, id)) {
    return NextResponse.json({ error: 'photo_not_available' }, { status: 404 });
  }

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`;
  const fileRef = storage.bucket(bucketName).file(photoPath);

  try {
    const [exists] = await fileRef.exists();
    if (!exists) return NextResponse.json({ error: 'photo_not_found' }, { status: 404 });

    const [metadata] = await fileRef.getMetadata();
    const mimeType = metadata.contentType || '';
    if (!(STUDENT_PHOTO_MIME_TYPES as readonly string[]).includes(mimeType)) {
      return NextResponse.json({ error: 'unsupported_photo_type' }, { status: 415 });
    }

    const [buffer] = await fileRef.download();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'photo_not_found' }, { status: 404 });
  }
}
