import QRCode from 'qrcode';
import { useMemo } from 'react';

import { cn } from '@/shared/lib/utils';

const QUIET_ZONE = 4;

/**
 * A QR code drawn as one SVG path (no canvas, no innerHTML), always dark on white so phone
 * cameras read it in both themes.
 */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  /** Accessible name of the image. */
  label: string;
  className?: string;
}) {
  const { path, size } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
    let d = '';
    for (let row = 0; row < modules.size; row += 1) {
      for (let col = 0; col < modules.size; col += 1) {
        if (modules.get(row, col)) d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { path: d, size: modules.size + QUIET_ZONE * 2 };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={cn('rounded-lg bg-white', className)}
      data-testid="mfa-qr-code"
    >
      <rect width={size} height={size} className="fill-white" />
      <path d={path} className="fill-black" />
    </svg>
  );
}
