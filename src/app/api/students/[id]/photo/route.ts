import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getServerDb, getServerStorage } from '@/lib/firebase/server';
import {
  canTeacherViewStudentPhoto,
  isValidStudentPhotoPath,
  STUDENT_PHOTO_MAX_BYTES,
  STUDENT_PHOTO_MIME_TYPES,
} from '@/lib/students/student-photo';
import { COLLECTIONS } from '@/types/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPhotoBucketName() {
  return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`;
}

async function getParentOwnedStudent(id: string, uid: string) {
  const db = getServerDb();
  if (!db) return { response: NextResponse.json({ error: 'server_not_configured' }, { status: 500 }) };

  const [studentSnap, userSnap] = await Promise.all([
    db.collection(COLLECTIONS.STUDENTS).doc(id).get(),
    db.collection(COLLECTIONS.USERS).doc(uid).get(),
  ]);
  if (!studentSnap.exists) {
    return { response: NextResponse.json({ error: 'student_not_found' }, { status: 404 }) };
  }
  const student = studentSnap.data() || {};
  if (userSnap.data()?.role !== 'parent' || student.parentId !== uid) {
    return { response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { db, studentSnap, student };
}

function getPhotoExtension(contentType: string) {
  return contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const storage = getServerStorage();
  if (!storage) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const { id } = await params;
  const ownedStudent = await getParentOwnedStudent(id, session.uid);
  if ('response' in ownedStudent) return ownedStudent.response;

  const formData = await request.formData();
  const fileValue = formData.get('file');
  if (fileValue === null || typeof fileValue === 'string' || typeof fileValue.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'file_required' }, { status: 400 });
  }

  const file = fileValue as File;
  if (!(STUDENT_PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: 'unsupported_photo_type' }, { status: 415 });
  }
  if (file.size > STUDENT_PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: 'photo_too_large' }, { status: 413 });
  }

  const photoPath = `student-photos/${id}/student-photo-${Date.now()}.${getPhotoExtension(file.type)}`;
  try {
    await storage.bucket(getPhotoBucketName()).file(photoPath).save(
      Buffer.from(await file.arrayBuffer()),
      {
        resumable: false,
        metadata: {
          contentType: file.type,
          cacheControl: 'private, no-store',
        },
      },
    );
    return NextResponse.json({ photoPath });
  } catch {
    return NextResponse.json({ error: 'photo_upload_failed' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const storage = getServerStorage();
  if (!storage) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  const { id } = await params;
  const ownedStudent = await getParentOwnedStudent(id, session.uid);
  if ('response' in ownedStudent) return ownedStudent.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const photoPath = body && typeof body === 'object' && 'photoPath' in body && typeof body.photoPath === 'string'
    ? body.photoPath
    : '';
  if (!isValidStudentPhotoPath(photoPath, id)) {
    return NextResponse.json({ error: 'invalid_photo_path' }, { status: 400 });
  }
  if (ownedStudent.student.photoPath === photoPath) {
    return NextResponse.json({ error: 'saved_photo_requires_update' }, { status: 409 });
  }

  try {
    await storage.bucket(getPhotoBucketName()).file(photoPath).delete({ ignoreNotFound: true });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: 'photo_delete_failed' }, { status: 500 });
  }
}

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

  const fileRef = storage.bucket(getPhotoBucketName()).file(photoPath);

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
