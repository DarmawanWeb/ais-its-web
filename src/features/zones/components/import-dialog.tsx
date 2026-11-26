import { FileJson, FileUp, TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';

import { formatNumber } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';

import {
  IMPORT_MAX_BYTES,
  parseGeoJsonText,
  readFileText,
  type ImportResult,
} from '../lib/geojson-io';
import { ZoneKindBadge } from './zone-bits';

export type ImportedZone = Extract<ImportResult, { ok: true }>;

/**
 * GeoJSON import: drop or choose a `.geojson`/`.json` file, or paste the text. The file is
 * validated (structure, WGS84 bounds, swapped coordinates) before anything is sent; the result
 * opens in the editor, where the kind rules and the service validate it again.
 */
export function ImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (zone: ImportedZone) => void;
}) {
  const { t, i18n } = useTranslation('zones');
  const id = useId();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState('');

  const reset = () => {
    setResult(null);
    setFileName(null);
    setText('');
  };

  const dropzone = useDropzone({
    multiple: false,
    maxSize: IMPORT_MAX_BYTES,
    accept: { 'application/geo+json': ['.geojson'], 'application/json': ['.json', '.geojson'] },
    onDropAccepted: ([file]) => {
      if (!file) return;
      setFileName(file.name);
      readFileText(file).then(
        (content) => setResult(parseGeoJsonText(content, file.size)),
        () => setResult({ ok: false, error: 'invalid_json' }),
      );
    },
    onDropRejected: ([rejection]) => {
      setFileName(rejection?.file.name ?? null);
      const tooLarge = rejection?.errors.some((error) => error.code === 'file-too-large');
      setResult({ ok: false, error: tooLarge ? 'too_large' : 'not_geojson' });
    },
  });

  const n = (value: number) => formatNumber(value, i18n.language);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('import.title')}</DialogTitle>
          <DialogDescription>{t('import.description')}</DialogDescription>
        </DialogHeader>
        <div
          {...dropzone.getRootProps({
            className: cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              dropzone.isDragActive
                ? 'border-primary bg-primary/8'
                : 'border-border hover:border-primary/50 hover:bg-muted/40',
            ),
          })}
          aria-label={t('import.dropLabel')}
        >
          <input
            {...dropzone.getInputProps()}
            data-testid="zone-import-input"
            aria-label={t('import.chooseFile')}
          />
          <FileUp className="size-8 text-primary" aria-hidden />
          <p className="text-sm font-medium">
            {dropzone.isDragActive ? t('import.dropNow') : t('import.drop')}
          </p>
          <p className="text-xs text-muted-foreground">{t('import.hint', { size: 4 })}</p>
        </div>
        <details className="rounded-lg border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">{t('import.paste')}</summary>
          <div className="mt-2 space-y-2">
            <Label htmlFor={`${id}-text`} className="sr-only">
              {t('import.paste')}
            </Label>
            <Textarea
              id={`${id}-text`}
              rows={5}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder='{"type":"Polygon","coordinates":[[[104.0,1.1],…]]}'
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={text.trim() === ''}
              onClick={() => {
                setFileName(null);
                setResult(parseGeoJsonText(text));
              }}
            >
              {t('import.check')}
            </Button>
          </div>
        </details>

        {result && !result.ok && (
          <Alert variant="destructive" role="alert">
            <TriangleAlert />
            <AlertTitle>{t(`import.errors.${result.error}.title`)}</AlertTitle>
            <AlertDescription>
              {t(`import.errors.${result.error}.hint`, { detail: result.detail ?? '' })}
              {fileName && <span className="mt-1 block font-mono text-xs">{fileName}</span>}
            </AlertDescription>
          </Alert>
        )}
        {result?.ok && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm" role="status">
            <p className="flex items-center gap-2 font-medium">
              <FileJson className="size-4 text-success" aria-hidden />{' '}
              {fileName ?? t('import.pasted')}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">{t('import.geometry')}</dt>
              <dd className="font-mono">{result.geometry.type}</dd>
              <dt className="text-muted-foreground">{t('import.features')}</dt>
              <dd className="font-mono">{n(result.featureCount)}</dd>
              <dt className="text-muted-foreground">{t('import.vertices')}</dt>
              <dd className="font-mono">{n(result.vertexCount)}</dd>
              {result.properties.name && (
                <>
                  <dt className="text-muted-foreground">{t('form.name')}</dt>
                  <dd className="truncate">{result.properties.name}</dd>
                </>
              )}
              {result.properties.kind && (
                <>
                  <dt className="text-muted-foreground">{t('form.kind')}</dt>
                  <dd>
                    <ZoneKindBadge kind={result.properties.kind} className="text-xs" />
                  </dd>
                </>
              )}
            </dl>
            {result.droppedAltitude && (
              <p className="mt-2 text-xs text-muted-foreground">{t('import.altitudeDropped')}</p>
            )}
            {result.featureCount > 1 && (
              <p className="mt-1 text-xs text-muted-foreground">{t('import.merged')}</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button disabled={!result?.ok} onClick={() => result?.ok && onImport(result)}>
            {t('import.open')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
