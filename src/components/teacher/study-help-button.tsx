'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';

// Teacher button: generates a Thai study explanation for one owned session
// report via /api/ai/study-help. Idempotent (server returns cached version).
// Hidden entirely when the API reports the feature as disabled (503).
export default function StudyHelpButton({ reportId }: { reportId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'disabled' | 'error'>('idle');
  const [result, setResult] = useState<{ explanation: string; practiceSteps: string[] } | null>(null);

  async function generate() {
    setState('loading');
    try {
      const res = await fetch('/api/ai/study-help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
      });
      if (res.status === 503) {
        setState('disabled');
        return;
      }
      if (!res.ok) {
        setState('error');
        return;
      }
      const data = await res.json();
      setResult({ explanation: data.explanation, practiceSteps: data.practiceSteps || [] });
      setState('done');
    } catch {
      setState('error');
    }
  }

  if (state === 'disabled') return null;

  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
      {state !== 'done' ? (
        <button
          onClick={generate}
          disabled={state === 'loading'}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-violet-700 disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          {state === 'loading' ? 'กำลังสร้างคำอธิบาย…' : state === 'error' ? 'ลองอีกครั้ง' : '✨ สร้างคำอธิบายด้วย AI'}
        </button>
      ) : result && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold text-violet-700">
            <Sparkles className="h-3.5 w-3.5" /> คำอธิบายสำหรับผู้ปกครอง
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{result.explanation}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            {result.practiceSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {state !== 'loading' && state !== 'done' && (
        <p className="mt-1.5 text-[11px] text-slate-400">AI ช่วยร่างคำอธิบายบทเรียนให้ผู้ปกครองอ่านเข้าใจง่าย (ครูตรวจก่อนส่งได้)</p>
      )}
    </div>
  );
}
