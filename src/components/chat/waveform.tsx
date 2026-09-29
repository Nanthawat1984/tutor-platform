'use client';

// Waveform แถบเสียง — วาดจาก peaks ที่ฝั่งผู้บันทึกคำนวณไว้แล้ว
// เครื่องรับไม่ต้อง decode ซ้ำ จึงเบาและเปิดได้ทันที

interface WaveformProps {
  peaks: number[];
  progress?: number; // 0..1
  className?: string;
  color?: string;
}

export default function Waveform({
  peaks,
  progress = 0,
  className = 'h-8',
  color = 'currentColor',
}: WaveformProps) {
  const bars = peaks.length > 0 ? peaks : [0.2];
  const played = Math.round(bars.length * Math.min(Math.max(progress, 0), 1));

  return (
    <div className={`flex items-center gap-[2px] ${className}`} aria-hidden="true">
      {bars.map((peak, index) => (
        <span
          key={index}
          className="min-w-[2px] flex-1 rounded-full transition-colors"
          style={{
            height: `${Math.max(12, Math.min(100, (peak || 0.08) * 100))}%`,
            backgroundColor: color,
            opacity: index < played ? 1 : 0.35,
          }}
        />
      ))}
    </div>
  );
}
