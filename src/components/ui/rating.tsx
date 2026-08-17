import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RatingStarsProps {
  rating: number;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  reviewCount?: number;
  className?: string;
}

const sizeMap = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export function RatingStars({
  rating,
  size = 'md',
  showValue = false,
  reviewCount,
  className,
}: RatingStarsProps) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span className="relative inline-flex shrink-0">
        {/* Empty stars */}
        <span className="flex gap-0.5 text-slate-200">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={cn(sizeMap[size], 'fill-current')} />
          ))}
        </span>
        {/* Filled overlay clipped by rating */}
        <span
          className="absolute inset-0 flex gap-0.5 overflow-hidden text-amber-400"
          style={{ width: `${pct}%` }}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={cn(sizeMap[size], 'shrink-0 fill-current')} />
          ))}
        </span>
      </span>

      {showValue && (
        <span className="text-sm font-bold text-slate-700">
          {rating > 0 ? rating.toFixed(1) : 'ใหม่'}
        </span>
      )}
      {reviewCount !== undefined && reviewCount > 0 && (
        <span className="text-xs text-slate-400">({reviewCount})</span>
      )}
    </div>
  );
}
