'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import Waveform from './waveform';
import type { ChatAudio } from '@/types/chat';

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function AudioPlayer({ audio, mine }: { audio: ChatAudio; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTime = () => {
      setCurrentMs(el.currentTime * 1000);
      setProgress(el.duration ? el.currentTime / el.duration : 0);
    };
    const onEnd = () => { setPlaying(false); setProgress(0); setCurrentMs(0); };

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnd);
    el.addEventListener('error', () => setFailed(true));
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnd);
    };
  }, [audio.url]);

  function toggle() {
    const el = audioRef.current;
    if (!el || failed) return;
    if (el.paused) {
      el.play().then(() => setPlaying(true)).catch(() => setFailed(true));
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  if (failed) {
    return (
      <p className="text-xs text-slate-500">
        เปิดไฟล์เสียงไม่ได้ —{' '}
        <a href={audio.url} target="_blank" rel="noreferrer" className="underline">
          ลองเปิดโดยตรง
        </a>
      </p>
    );
  }

  const remaining = Math.max(0, audio.durationMs - (playing || currentMs ? currentMs : 0));

  return (
    <div className="flex min-w-[190px] items-center gap-3">
      <audio ref={audioRef} src={audio.url} preload="metadata" />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'หยุดฟัง' : 'เล่นเสียง'}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          mine ? 'bg-white/25 text-white hover:bg-white/35' : 'bg-pink-600 text-white hover:bg-pink-700'
        }`}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>

      <Waveform
        peaks={audio.peaks}
        progress={progress}
        className="h-8 flex-1"
        color={mine ? '#ffffff' : '#db2777'}
      />

      <span className={`w-10 shrink-0 text-right text-[11px] tabular-nums ${mine ? 'text-white/80' : 'text-slate-500'}`}>
        {formatDuration(playing || currentMs ? remaining : audio.durationMs)}
      </span>
    </div>
  );
}
