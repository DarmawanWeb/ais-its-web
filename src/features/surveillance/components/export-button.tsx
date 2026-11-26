import { Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { toApiProblem } from '@/shared/api/problem';
import { downloadCsv } from '@/shared/lib/csv';
import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/spinner';

/**
 * "Export CSV" of a whole filtered list: `collect()` pages through the API (at most 5 000 rows),
 * the rows are downloaded with `downloadCsv()`; a toast reports the row count or the error.
 */
export function ExportCsvButton({
  fileName,
  collect,
  disabled,
}: {
  fileName: string;
  collect: () => Promise<{ rows: Record<string, unknown>[]; truncated: boolean }>;
  disabled?: boolean;
}) {
  const { t } = useTranslation('surveillance');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { rows, truncated } = await collect();
      if (rows.length === 0) {
        toast.info(t('export.empty'));
        return;
      }
      downloadCsv(fileName, rows);
      toast.success(t('export.done', { count: rows.length }), {
        description: truncated ? t('export.truncated', { count: rows.length }) : undefined,
      });
    } catch (error) {
      const problem = toApiProblem(error);
      toast.error(t('export.failed'), { description: problem.detail ?? problem.title });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" onClick={() => void run()} disabled={disabled || busy}>
      {busy ? <Spinner /> : <Download />}
      {t('common:actions.exportCsv')}
    </Button>
  );
}
