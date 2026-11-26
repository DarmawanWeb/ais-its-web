import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { EngineDto } from '@/shared/api/generated/fleet/model';
import { UnitValue } from '@/shared/domain-ui/values';
import { Button } from '@/shared/ui/button';

import { MAX_VESSEL_ENGINES, type VesselFormValues } from '../lib/vessel-form';
import { NumberField, SelectField } from './form-fields';

function EngineSpecs({ engine }: { engine: EngineDto | undefined }) {
  const { t } = useTranslation('vessels');
  if (!engine) return null;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>
        {t('engines.powerKw')}: <UnitValue value={engine.powerKw} unit="kw" />
      </span>
      <span>
        {t('engines.rpm')}: <span className="font-mono">{engine.rpm}</span>
      </span>
      <span>
        {t('engines.sfoc')}: <UnitValue value={engine.sfoc} unit="gkwh" />
      </span>
    </p>
  );
}

const engineOption = (engine: EngineDto) => ({
  value: engine.id,
  label: engine.code ? `${engine.name} · ${engine.code}` : engine.name,
});

/** Main engine (one row with a quantity) and auxiliary engines (field array, ≤ 16 rows in all). */
export function EngineFields({
  mainEngines,
  auxEngines,
}: {
  mainEngines: readonly EngineDto[];
  auxEngines: readonly EngineDto[];
}) {
  const { t } = useTranslation('vessels');
  const { control, formState } = useFormContext<VesselFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'auxEngines' });
  const main = useWatch({ control, name: 'mainEngine.engineId' });
  const aux = useWatch({ control, name: 'auxEngines' });
  const mainEngine = mainEngines.find((engine) => engine.id === main);
  const rows = (main ? 1 : 0) + fields.length;
  const arrayError =
    formState.errors.auxEngines?.root?.message ?? formState.errors.auxEngines?.message;
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 rounded-lg border bg-muted/15 p-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <div className="grid gap-2">
          <SelectField
            name="mainEngine.engineId"
            label={t('engines.main')}
            placeholder={t('form.selectEngine')}
            noneLabel={t('engines.noMain')}
            options={mainEngines.map(engineOption)}
          />
          <EngineSpecs engine={mainEngine} />
        </div>
        <NumberField name="mainEngine.quantity" label={t('engines.quantity')} step="1" />
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{t('engines.auxiliary')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rows >= MAX_VESSEL_ENGINES}
            onClick={() => append({ engineId: '', quantity: 1 })}
          >
            <Plus /> {t('engines.addAux')}
          </Button>
        </div>
        {fields.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            {t('engines.noAux')}
          </p>
        ) : (
          <ul className="grid gap-3">
            {fields.map((row, index) => (
              <li
                key={row.id}
                className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-start"
              >
                <div className="grid gap-2">
                  <SelectField
                    name={`auxEngines.${index}.engineId`}
                    label={t('engines.auxRow', { index: index + 1 })}
                    placeholder={t('form.selectEngine')}
                    options={auxEngines.map(engineOption)}
                  />
                  <EngineSpecs
                    engine={auxEngines.find((engine) => engine.id === aux[index]?.engineId)}
                  />
                </div>
                <NumberField
                  name={`auxEngines.${index}.quantity`}
                  label={t('engines.quantity')}
                  step="1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-danger sm:mt-6"
                  aria-label={t('engines.removeAux', { index: index + 1 })}
                  onClick={() => remove(index)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {arrayError && (
          <p role="alert" className="text-xs font-medium text-danger">
            {arrayError}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {t('engines.limit', { count: rows, max: MAX_VESSEL_ENGINES })}
        </p>
      </div>
    </div>
  );
}
