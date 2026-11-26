import { ArrowLeft, Lock, Pencil, PlusCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';

import { useCanAccessOrg } from '@/shared/auth/hooks';
import { EmptyState, ErrorState } from '@/shared/domain-ui/feedback';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { Button } from '@/shared/ui/button';

import { useReferenceData } from '../api/reference-data';
import { useVesselByMmsi } from '../api/vessels';
import { DeleteVesselButton } from '../components/delete-vessel-button';
import { VesselEditor, VesselEditorSkeleton } from '../components/vessel-editor';
import { localizeProblem } from '@/shared/api/problem-copy';
import { fleetProblemCopies } from '../lib/problems';
import { isDetailView, parseMmsiParam } from '../lib/vessel';

function Back({ to }: { to: string }) {
  const { t } = useTranslation('vessels');
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
      <Link to={to}>
        <ArrowLeft /> {t('detail.back')}
      </Link>
    </Button>
  );
}

/** `/vessels/new` (`vessel:write`): a vessel of the active organization. */
export function VesselCreatePage() {
  const { t } = useTranslation('vessels');
  const reference = useReferenceData();
  return (
    <div className="flex flex-col gap-6">
      <Back to="/vessels" />
      <PageHeader
        eyebrow={t('list.title')}
        title={t('form.createTitle')}
        description={t('form.createDescription')}
        icon={PlusCircle}
      />
      {reference.error ? (
        <ErrorState
          error={localizeProblem(reference.error, fleetProblemCopies(t))}
          onRetry={reference.refetch}
        />
      ) : reference.isPending ? (
        <VesselEditorSkeleton />
      ) : (
        <VesselEditor reference={reference} />
      )}
    </div>
  );
}

/** `/vessels/:mmsi/edit` (`vessel:write`, own organization only). */
export function VesselEditPage() {
  const { t } = useTranslation('vessels');
  const navigate = useNavigate();
  const mmsi = parseMmsiParam(useParams<{ mmsi: string }>().mmsi);
  const query = useVesselByMmsi(mmsi);
  const reference = useReferenceData();
  const vessel = query.data;
  const detail = isDetailView(vessel) ? vessel : null;
  const canAccess = useCanAccessOrg(detail ? detail.orgId : undefined);
  const back = mmsi ? `/vessels/${mmsi}` : '/vessels';
  const error = query.error ?? reference.error;

  let body;
  if (mmsi === null) {
    body = <EmptyState title={t('detail.invalidMmsi')} description={t('detail.invalidMmsiHint')} />;
  } else if (error) {
    body = (
      <ErrorState
        error={localizeProblem(error, fleetProblemCopies(t))}
        onRetry={() => {
          void query.refetch();
          reference.refetch();
        }}
      />
    );
  } else if (query.isPending || reference.isPending) {
    body = <VesselEditorSkeleton />;
  } else if (!detail || !canAccess) {
    body = (
      <EmptyState
        icon={Lock}
        title={t('form.notOwnTitle')}
        description={t('form.notOwnDescription')}
      />
    );
  } else {
    body = <VesselEditor key={detail.id} vessel={detail} reference={reference} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Back to={back} />
      <PageHeader
        eyebrow={vessel?.name ?? t('list.title')}
        title={t('form.editTitle')}
        description={t('form.editDescription')}
        icon={Pencil}
        actions={
          detail && canAccess ? (
            <DeleteVesselButton vessel={detail} onDeleted={() => void navigate('/vessels')} />
          ) : undefined
        }
      />
      {body}
    </div>
  );
}
