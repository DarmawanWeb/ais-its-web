import { LoaderCircle } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/shared/lib/utils';

export function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <LoaderCircle
      role="status"
      aria-label={props['aria-label'] ?? 'Loading'}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}
