import { Ship } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/shared/lib/utils';

const SIZE = {
  xs: 'size-9 rounded-md',
  sm: 'h-11 w-16 rounded-md',
  md: 'h-24 w-36 rounded-lg',
  hero: 'aspect-[16/10] w-full rounded-xl',
} as const;

/**
 * Vessel photo (presigned URL of the fleet service, valid 1 h) with a graceful fallback:
 * a sea-gradient tile with a ship glyph when there is no photo or it fails to load.
 */
export function VesselPhoto({
  url,
  name,
  size = 'sm',
  className,
}: {
  url: string | null | undefined;
  name: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(url) && failedUrl !== url;
  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden border bg-gradient-to-br from-primary/25 via-info/10 to-background',
        SIZE[size],
        className,
      )}
    >
      {showImage ? (
        <img
          src={url ?? undefined}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(url ?? null)}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-primary/70" aria-hidden>
          <Ship className={size === 'hero' ? 'size-16' : size === 'md' ? 'size-8' : 'size-4'} />
          <svg
            className="absolute inset-x-0 bottom-0 h-1/3 w-full text-primary/15"
            viewBox="0 0 100 20"
            preserveAspectRatio="none"
          >
            <path d="M0 10 Q 12.5 4 25 10 T 50 10 T 75 10 T 100 10 V20 H0 Z" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  );
}
