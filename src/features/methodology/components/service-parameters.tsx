import { useTranslation } from 'react-i18next';

import type { EmissionMethodologyDto } from '@/shared/api/generated/emission/model';
import { MethodInfo } from '@/shared/domain-ui/method-info';
import { formatNumber } from '@/shared/lib/format';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

/**
 * Parameters the emission service runs with now (`GET /emission/methodology`): the active
 * reduction factors Z and the reference lines (a, c) and rating vectors d of the vessel types.
 */
export function ServiceParameters({ data }: { data: EmissionMethodologyDto }) {
  const { t, i18n } = useTranslation('methodology');
  const n = (value: number | null | undefined, digits = 4) =>
    formatNumber(value, i18n.language, { maximumFractionDigits: digits });
  const factors = [...data.reductionFactors].sort((a, b) => a.year - b.year);
  return (
    <div className="flex flex-col gap-5">
      <div className="min-w-0 space-y-2">
        <h3 className="flex items-center gap-1 text-sm font-semibold">
          {t('service.factors')} <MethodInfo methodId="cii.reduction_factor_z" />
        </h3>
        <div className="overflow-x-auto rounded-lg border">
          <Table aria-label={t('service.factors')}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('service.year')}</TableHead>
                <TableHead className="text-right">Z (%)</TableHead>
                <TableHead>{t('service.source')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {factors.map((factor) => (
                <TableRow key={factor.year}>
                  <TableCell className="font-mono tabular-nums">{factor.year}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {n(factor.zPercent, 3)}
                  </TableCell>
                  <TableCell className="text-sm whitespace-normal text-muted-foreground">
                    {factor.source}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      {data.vesselTypes.length > 0 && (
        <div className="min-w-0 space-y-2">
          <h3 className="flex items-center gap-1 text-sm font-semibold">
            {t('service.vesselTypes')} <MethodInfo methodId="cii.reference_line" />
            <MethodInfo methodId="cii.rating_grade" />
          </h3>
          <div className="overflow-x-auto rounded-lg border">
            <Table aria-label={t('service.vesselTypes')}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('service.type')}</TableHead>
                  <TableHead>{t('service.capacityUnit')}</TableHead>
                  <TableHead className="text-right">a</TableHead>
                  <TableHead className="text-right">c</TableHead>
                  <TableHead className="text-right">{t('service.capacityFixed')}</TableHead>
                  <TableHead className="text-right">d₁–d₄</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.vesselTypes.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell>
                      <span className="flex flex-col">
                        <span className="font-medium">{type.name}</span>
                        <code className="font-mono text-[11px] text-muted-foreground">
                          {type.code}
                        </code>
                      </span>
                    </TableCell>
                    <TableCell className="font-mono">{type.capacityUnit}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {n(type.a, 1)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {n(type.c, 3)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {type.capacityFixed === null ? '—' : n(type.capacityFixed, 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs whitespace-nowrap tabular-nums">
                      {[type.d.d1, type.d.d2, type.d.d3, type.d.d4]
                        .map((value) => n(value, 2))
                        .join(' · ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{data.attribution}</p>
    </div>
  );
}
