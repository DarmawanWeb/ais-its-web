import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { type FileRejection, useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

import { VesselPhoto } from './vessel-photo';

/** Photo limits of the fleet service (`POST /vessels/:id/photo`): JPEG/PNG/WebP up to 5 MB. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] };

/**
 * Drop zone of the vessel photo (react-dropzone): drag & drop or the file dialog, keyboard
 * reachable; validates type and size before anything is sent.
 */
export function PhotoDropzone({
  name,
  previewUrl,
  busy = false,
  disabled = false,
  onSelect,
  onRemove,
}: {
  name: string;
  previewUrl: string | null;
  busy?: boolean;
  disabled?: boolean;
  onSelect: (file: File) => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation('vessels');
  const [rejection, setRejection] = useState<string | null>(null);
  const onDrop = (accepted: File[], rejected: FileRejection[]) => {
    const first = rejected[0]?.errors[0];
    if (first) {
      setRejection(
        first.code === 'file-too-large'
          ? t('photo.tooLarge')
          : first.code === 'file-invalid-type'
            ? t('photo.invalidType')
            : t('photo.invalid'),
      );
      return;
    }
    setRejection(null);
    const file = accepted[0];
    if (file) onSelect(file);
  };
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: ACCEPT,
    maxSize: PHOTO_MAX_BYTES,
    multiple: false,
    disabled: disabled || busy,
    noClick: true,
    onDrop,
  });
  return (
    <div className="grid gap-3">
      <div
        {...getRootProps({
          className: cn(
            'relative overflow-hidden rounded-xl border-2 border-dashed transition-colors',
            isDragActive ? 'border-primary bg-primary/8' : 'border-border',
          ),
        })}
        data-testid="photo-dropzone"
      >
        <input {...getInputProps({ 'aria-label': t('photo.input') })} />
        <VesselPhoto url={previewUrl} name={name} size="hero" className="rounded-none border-0" />
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 p-4 text-center backdrop-blur-[2px] transition-opacity',
            previewUrl && !isDragActive && !busy
              ? 'opacity-0 focus-within:opacity-100 hover:opacity-100'
              : 'opacity-100',
          )}
        >
          {busy ? (
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
          ) : (
            <ImageUp className="size-6 text-primary" aria-hidden />
          )}
          <p className="text-sm font-medium">
            {busy ? t('photo.uploading') : isDragActive ? t('photo.drop') : t('photo.hint')}
          </p>
          <p className="text-xs text-muted-foreground">{t('photo.limits')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={open}
            disabled={disabled || busy}
          >
            {previewUrl ? t('photo.replace') : t('photo.choose')}
          </Button>
        </div>
      </div>
      {rejection && (
        <p role="alert" className="text-xs font-medium text-danger">
          {rejection}
        </p>
      )}
      {previewUrl && onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit text-muted-foreground hover:text-danger"
          onClick={onRemove}
          disabled={disabled || busy}
        >
          <Trash2 /> {t('photo.remove')}
        </Button>
      )}
    </div>
  );
}
