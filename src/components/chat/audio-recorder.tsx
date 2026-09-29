'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Send, Square, Trash2 } from 'lucide-react';
import Waveform from './waveform';
import { CHAT_AUDIO_MAX_SECONDS, CHAT_PEAKS_COUNT, type ChatAudioExtension } from '@/types/chat';

export interface RecordedClip {
  blob: Blob;
  extension: ChatAudioExtension;
  durationMs: number;
  size: number;
  peaks: number[];
}

const MIME_CANDIDATES: Array<{ mime: string; ext: ChatAudioExtension }> = [
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/webm', ext: 'webm' },
  { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
  { mime: 'audio/mp4', ext: 'm4a' },
];

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  return (
    MIME_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.mime)) ||
    MIME_CANDIDATES[MIME_CANDIDATES.length - 1]
  );
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** สรุปความดังเป็นแท่ง ๆ สำหรับวาด waveform (ถอดเสียงที่ผู้บันทึกครั้งเดียว) */
async function computePeaks(blob: Blob): Promise<number[]> {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return [];
    const context = new Ctx();
    try {
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      const channel = buffer.getChannelData(0);
      const block = Math.max(1, Math.floor(channel.length / CHAT_PEAKS_COUNT));
      const peaks: number[] = [];
      for (let i = 0; i < CHAT_PEAKS_COUNT; i += 1) {
        let max = 0;
        const start = i * block;
        for (let j = start; j < start + block && j < channel.length; j += 1) {
          const value = Math.abs(channel[j]);
          if (value > max) max = value;
        }
        peaks.push(Math.min(1, max));
      }
      const loudest = Math.max(...peaks, 0.01);
      return peaks.map((p) => p / loudest);
    } finally {
      await context.close();
    }
  } catch {
    // decode ไม่ได้ (เช่น Safari บางเวอร์ชัน) — วาดเป็นแท่งเรียบแทน
    return [];
  }
}

interface AudioRecorderProps {
  disabled?: boolean;
  sending?: boolean;
  onSend: (clip: RecordedClip) => void | Promise<void>;
}

export default function AudioRecorder({ disabled, sending, onSend }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [clip, setClip] = useState<RecordedClip | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<(() => void) | null>(null);

  const stopStreams = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopAll = useCallback(() => {
    audioContextRef.current?.();
    audioContextRef.current = null;
    stopStreams();
  }, [stopStreams]);

  useEffect(() => stopStreams, [stopStreams]);

  const finish = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    const mime = recorder.mimeType || 'audio/webm';
    const ext = MIME_CANDIDATES.find((c) => mime.startsWith(c.mime.split(';')[0]))?.ext || 'webm';

    recorder.onstop = async () => {
      stopStreams();
      setRecording(false);
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      if (blob.size === 0) return;
      const durationMs = Math.max(0, Date.now() - startedAtRef.current);
      setClip({ blob, extension: ext, durationMs, size: blob.size, peaks: await computePeaks(blob) });
    };
    recorder.stop();
  }, [stopStreams]);

  async function start() {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('เบราว์เซอร์นี้ไม่รองรับการอัดเสียง');
      return;
    }
    const candidate = pickMime();
    if (!candidate) {
      setError('เบราว์เซอร์นี้ไม่รองรับการอัดเสียง');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: candidate.mime,
        audioBitsPerSecond: 48_000,
      });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;

      // ดังไมค์สดขณะอัด
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) {
        const context = new Ctx();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        context.createMediaStreamSource(stream).connect(analyser);
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const draw = () => {
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i += 1) {
            sum += Math.abs(buffer[i] - 128);
          }
          const level = Math.min(1, sum / buffer.length / 60);
          setLevels((prev) => [...prev.slice(-23), level]);
          rafRef.current = requestAnimationFrame(draw);
        };
        draw();
        audioContextRef.current = () => { context.close().catch(() => {}); };
      }

      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setLevels([]);
      setRecording(true);
      recorder.start(250);
      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= CHAT_AUDIO_MAX_SECONDS * 1000) finish();
      }, 200);
    } catch {
      stopAll();
      setError('เปิดไมค์ไม่ได้ — กรุณาตรวจสอบสิทธิ์การใช้งานไมโครโฟน');
    }
  }

  function cancel() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    stopAll();
    setRecording(false);
    setLevels([]);
    setClip(null);
    setElapsedMs(0);
  }

  if (clip) {
    return (
      <div className="flex w-full items-center gap-2">
        <Waveform peaks={clip.peaks} progress={0} className="h-8 flex-1" color="#db2777" />
        <span className="text-xs tabular-nums text-slate-500">{formatDuration(clip.durationMs)}</span>
        <button
          type="button"
          onClick={() => setClip(null)}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
          aria-label="ลบเสียงที่อัด"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={async () => { await onSend(clip); setClip(null); }}
          disabled={sending}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-600 text-white disabled:opacity-50"
          aria-label="ส่งเสียง"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (recording) {
    return (
      <div className="flex w-full items-center gap-2 rounded-xl bg-rose-50 px-3 py-2">
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-rose-500" />
        <span className="w-10 shrink-0 text-xs font-semibold tabular-nums text-rose-600">
          {formatDuration(elapsedMs)}
        </span>
        <Waveform peaks={levels} className="h-7 flex-1" color="#e11d48" />
        <button
          type="button"
          onClick={cancel}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-rose-500 hover:bg-rose-100"
          aria-label="ยกเลิกการอัด"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={finish}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white hover:bg-rose-700"
          aria-label="หยุดอัด"
        >
          <Square className="h-4 w-4 fill-current" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {error && <span className="mr-1 text-[11px] text-rose-600">{error}</span>}
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-slate-200 text-slate-500 transition hover:border-pink-300 hover:text-pink-600 disabled:opacity-40"
        aria-label="อัดเสียง"
        title="อัดเสียง"
      >
        <Mic className="h-5 w-5" />
      </button>
    </div>
  );
}
