import { useCallback, useEffect, useRef, useState } from 'react';

export interface PendingPhoto {
  file: File;
  /** Object URL of the file for the preview (revoked when replaced or unmounted). */
  url: string;
}

/** A photo chosen before the vessel exists (uploaded right after `POST /vessels`). */
export function usePendingPhoto() {
  const [photo, setPhoto] = useState<PendingPhoto | null>(null);
  const current = useRef<PendingPhoto | null>(null);
  const select = useCallback((file: File | null) => {
    if (current.current) URL.revokeObjectURL(current.current.url);
    const next = file ? { file, url: URL.createObjectURL(file) } : null;
    current.current = next;
    setPhoto(next);
  }, []);
  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current.url);
    },
    [],
  );
  return { photo, select };
}
