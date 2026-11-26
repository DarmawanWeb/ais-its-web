import { ZONE_KINDS, ZONE_KIND_LABELS } from '@darmawanweb/ais-its-contracts/domain';
import { FileJson, Globe2, Info, Lock, Save, Trash2, TriangleAlert } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { ZoneDto } from '@/shared/api/generated/geo/model';
import { formatDateTime } from '@/shared/lib/format';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  useFormField,
} from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Separator } from '@/shared/ui/separator';
import { Spinner } from '@/shared/ui/spinner';
import { Switch } from '@/shared/ui/switch';
import { Textarea } from '@/shared/ui/textarea';

import { GEOFENCE_KINDS, KIND_GEOMETRY_TYPES } from '../lib/geometry-rules';
import { kindCss } from '../lib/kind-style';
import {
  KIND_PROPERTY_FIELDS,
  NUMERIC_PROPERTIES,
  slugifyCode,
  type PropertyField,
  type ZoneFormValues,
} from '../lib/zone-model';

/** Field error, translated when it is one of the form's message keys (server messages as is). */
function FieldMessage() {
  const { t, i18n } = useTranslation('zones');
  const { error, formMessageId } = useFormField();
  const message = error?.message;
  if (!message) return null;
  const key = `zones:form.errors.${message}`;
  return (
    <p id={formMessageId} role="alert" className="text-xs font-medium text-danger">
      {i18n.exists(key) ? t(`form.errors.${message}`) : message}
    </p>
  );
}

const KNOWN_PROPERTIES = new Set([
  'operator',
  'authority',
  'legalBasis',
  'unlocode',
  'maxDraughtM',
  'directionDeg',
  'maxSpeedKn',
  'depthM',
  'note',
  'source',
]);

/**
 * Properties of a zone: name, code (immutable once created), kind with its allowed geometry
 * types, buffer, geofence alert, active flag, global scope (super_admin/authority), provenance
 * (`source`) and the kind-specific properties of contracts `ZONE_PROPERTY_SCHEMAS`.
 */
export function ZoneForm({
  form,
  isNew,
  readOnly,
  readOnlyReason,
  allowGlobal,
  zone,
  etag,
  saving,
  dirty,
  problem,
  onSubmit,
  onDelete,
  onExport,
  canDelete,
}: {
  form: UseFormReturn<ZoneFormValues>;
  isNew: boolean;
  readOnly: boolean;
  readOnlyReason: string | null;
  allowGlobal: boolean;
  zone: ZoneDto | null;
  etag: string | null;
  saving: boolean;
  dirty: boolean;
  problem: { title: string; description: string } | null;
  onSubmit: () => void;
  onDelete: () => void;
  onExport: () => void;
  canDelete: boolean;
}) {
  const { t, i18n } = useTranslation('zones');
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const kind = form.watch('kind');
  const codeTouched = form.formState.dirtyFields.code;
  const propertyFields = KIND_PROPERTY_FIELDS[kind];
  const otherProperties = Object.keys(zone?.properties ?? {}).filter(
    (key) => !KNOWN_PROPERTIES.has(key),
  );

  const textField = (name: PropertyField, inputMode?: 'decimal') => (
    <FormField
      key={name}
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t(`form.properties.${name}`)}</FormLabel>
          <FormControl>
            <Input
              {...field}
              inputMode={inputMode}
              disabled={readOnly}
              className={inputMode ? 'font-mono' : undefined}
            />
          </FormControl>
          <FieldMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form
        className="space-y-5 p-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        aria-label={t('form.label')}
      >
        {readOnly && readOnlyReason && (
          <Alert variant="info">
            <Lock />
            <AlertTitle>{t('form.readOnlyTitle')}</AlertTitle>
            <AlertDescription>{readOnlyReason}</AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('form.name')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={readOnly}
                  onChange={(event) => {
                    field.onChange(event);
                    if (isNew && !codeTouched) {
                      form.setValue('code', slugifyCode(event.target.value), {
                        shouldValidate: form.formState.isSubmitted,
                      });
                    }
                  }}
                />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('form.code')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={readOnly || !isNew}
                  className="font-mono"
                  autoComplete="off"
                />
              </FormControl>
              <FormDescription>
                {isNew ? t('form.codeHint') : t('form.codeImmutable')}
              </FormDescription>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('form.kind')}</FormLabel>
              <Select
                value={field.value}
                onValueChange={(value) => field.onChange(value)}
                disabled={readOnly}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ZONE_KINDS.map((option) => (
                    <SelectItem key={option} value={option}>
                      <span
                        className="size-2.5 rounded-sm"
                        style={{ background: kindCss(option) }}
                        aria-hidden
                      />
                      {ZONE_KIND_LABELS[option][locale]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                {t('form.kindHint', { types: KIND_GEOMETRY_TYPES[kind].join(', ') })}{' '}
                {t(`form.kindUse.${kind}`)}
              </FormDescription>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bufferM"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('form.bufferM')}</FormLabel>
              <div className="relative">
                <FormControl>
                  <Input
                    {...field}
                    inputMode="decimal"
                    disabled={readOnly}
                    className="pr-10 font-mono"
                  />
                </FormControl>
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                  m
                </span>
              </div>
              <FormDescription>{t('form.bufferHint')}</FormDescription>
              <FieldMessage />
            </FormItem>
          )}
        />

        <div className="space-y-3 rounded-lg border p-3">
          <FormField
            control={form.control}
            name="active"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <FormLabel>{t('form.active')}</FormLabel>
                  <FormDescription>{t('form.activeHint')}</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={readOnly}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <Separator />
          <FormField
            control={form.control}
            name="alertOnEnter"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <FormLabel>{t('form.alertOnEnter')}</FormLabel>
                  <FormDescription>
                    {GEOFENCE_KINDS.includes(kind)
                      ? t('form.alertHint')
                      : t('form.alertHintUnused')}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={readOnly}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          {isNew && allowGlobal && (
            <>
              <Separator />
              <FormField
                control={form.control}
                name="global"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <FormLabel className="flex items-center gap-1.5">
                        <Globe2 className="size-3.5" aria-hidden /> {t('form.global')}
                      </FormLabel>
                      <FormDescription>{t('form.globalHint')}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </>
          )}
        </div>

        <fieldset className="space-y-4">
          <legend className="mb-2 text-sm font-semibold">{t('form.propertiesTitle')}</legend>
          {propertyFields.map((name) =>
            textField(name, NUMERIC_PROPERTIES.has(name) ? 'decimal' : undefined),
          )}
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.properties.note')}</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} disabled={readOnly} />
                </FormControl>
                <FieldMessage />
              </FormItem>
            )}
          />
          {otherProperties.length > 0 && (
            <p className="flex gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t('form.otherProperties', { keys: otherProperties.join(', ') })}
            </p>
          )}
        </fieldset>

        <FormField
          control={form.control}
          name="source"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('form.source')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={2}
                  disabled={readOnly}
                  placeholder={t('form.sourcePlaceholder')}
                />
              </FormControl>
              <FormDescription>{t('form.sourceHint')}</FormDescription>
              <FieldMessage />
            </FormItem>
          )}
        />

        {zone && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
            <dt className="text-muted-foreground">{t('form.createdBy')}</dt>
            <dd>{zone.createdBy ? t('form.createdByUser') : t('form.createdBySeed')}</dd>
            <dt className="text-muted-foreground">{t('form.createdAt')}</dt>
            <dd>{formatDateTime(zone.createdAt, i18n.language)}</dd>
            <dt className="text-muted-foreground">{t('form.updatedAt')}</dt>
            <dd>{formatDateTime(zone.updatedAt, i18n.language)}</dd>
            <dt className="text-muted-foreground">{t('form.version')}</dt>
            <dd className="truncate font-mono" title={etag ?? undefined}>
              {etag ?? '—'}
            </dd>
          </dl>
        )}

        {problem && (
          <Alert variant="destructive" role="alert">
            <TriangleAlert />
            <AlertTitle>{problem.title}</AlertTitle>
            <AlertDescription>{problem.description}</AlertDescription>
          </Alert>
        )}

        {readOnly && (
          <div className="flex justify-end border-t pt-4">
            <Button type="button" variant="outline" onClick={onExport}>
              <FileJson /> {t('actions.exportGeojson')}
            </Button>
          </div>
        )}

        {!readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            {canDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="text-danger hover:bg-danger/10 hover:text-danger"
                onClick={onDelete}
              >
                <Trash2 /> {t('common:actions.delete')}
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={saving || (!isNew && !dirty)}>
              {saving ? <Spinner /> : <Save />}
              {isNew ? t('form.create') : t('form.save')}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
