'use client';

import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import AudioPlayer from './audio-player';
import type { ChatMessage } from '@/types/chat';

export type MessageStatus = 'pending' | 'sent' | 'failed';

function formatClock(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

interface MessageBubbleProps {
  message: ChatMessage;
  mine: boolean;
  status: MessageStatus;
  /** อีกฝั่งอ่านถึงข้อความนี้แล้วหรือยัง (ใช้แสดงติ๊กสองขีด) */
  readByOther: boolean;
  showTail: boolean;
}

export default function MessageBubble({
  message,
  mine,
  status,
  readByOther,
  showTail,
}: MessageBubbleProps) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] sm:max-w-[70%] ${showTail ? 'mb-1' : 'mb-0.5'}`}>
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
            mine
              ? 'rounded-br-md bg-gradient-to-br from-pink-500 to-rose-500 text-white'
              : 'rounded-bl-md bg-white text-slate-800 shadow-sm ring-1 ring-slate-100'
          }`}
        >
          {message.type === 'audio' && message.audio ? (
            <AudioPlayer audio={message.audio} mine={mine} />
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          )}

          <div
            className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
              mine ? 'text-white/75' : 'text-slate-400'
            }`}
          >
            <span className="tabular-nums">{formatClock(message.createdAt)}</span>
            {mine && (
              <span aria-label={statusLabel(status, readByOther)}>
                {status === 'pending' ? (
                  <Clock className="h-3 w-3" />
                ) : status === 'failed' ? (
                  <AlertCircle className="h-3 w-3 text-rose-200" />
                ) : readByOther ? (
                  <CheckCheck className="h-3 w-3" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: MessageStatus, readByOther: boolean): string {
  if (status === 'pending') return 'กำลังส่ง';
  if (status === 'failed') return 'ส่งไม่สำเร็จ';
  return readByOther ? 'อ่านแล้ว' : 'ส่งแล้ว';
}
