import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/firebase/server';
import { getSessionUser } from '@/lib/auth/session';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { checkRateLimit, sweepRateLimitBuckets } from '@/lib/rate-limit';
import { logEvent } from '@/lib/log';
import { generateStudyHelp } from '@/lib/ai/study-help';

// POST /api/ai/study-help { reportId }
// Teacher-only: generates a Thai explanation for ONE owned session report and
// stores it on the report. Idempotent — returns the stored version on retry.
// Disabled unless AI_STUDY_HELP_ENABLED=true + OPENAI_API_KEY set.
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServerDb();
  if (!db) return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });

  sweepRateLimitBuckets();
  const limit = checkRateLimit(`ai:${session.uid}`, 10, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(limit.resetAfterMs / 1000)) },
    });
  }

  const body = await request.json().catch(() => ({})) as { reportId?: string };
  if (!body.reportId) return NextResponse.json({ error: 'missing_report_id' }, { status: 400 });

  const ref = db.collection(COLLECTIONS.SESSION_REPORTS).doc(body.reportId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'report_not_found' }, { status: 404 });
  const report = snap.data() as any;
  if (report.teacherId !== session.uid) {
    logEvent('warn', 'ai_study_help_forbidden', { reportId: body.reportId });
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (report.aiExplanation) {
    return NextResponse.json({
      ok: true,
      cached: true,
      explanation: report.aiExplanation,
      practiceSteps: report.aiPracticeSteps || [],
    });
  }

  try {
    const result = await generateStudyHelp({
      topicsCovered: report.topicsCovered,
      homework: report.homework,
      score: report.score,
      notes: report.notes,
      studentLevel: report.studentLevel,
      courseTitle: report.courseTitle,
    });
    await ref.update({
      aiExplanation: result.explanation,
      aiPracticeSteps: result.practiceSteps,
      aiModel: result.model,
      aiGeneratedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    logEvent('info', 'ai_study_help_generated', { reportId: body.reportId });
    return NextResponse.json({ ok: true, cached: false, ...result });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'ai_failed';
    const status = reason === 'ai_study_help_disabled' || reason === 'ai_study_help_key_unavailable' ? 503 : 502;
    logEvent('warn', 'ai_study_help_failed', { reportId: body.reportId, reason });
    return NextResponse.json({ error: reason }, { status });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
