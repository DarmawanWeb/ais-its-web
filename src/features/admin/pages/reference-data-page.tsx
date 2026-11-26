import { Anchor, Database, Flame, FunctionSquare, Lock, Search, Ship, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { usePermission } from '@/shared/auth';
import { PageHeader } from '@/shared/domain-ui/page-header';
import { Badge } from '@/shared/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import {
  EnginesTab,
  FormulasTab,
  FuelsTab,
  PortsTab,
  RegistryTab,
  VesselTypesTab,
} from '../components/reference/tabs';

const TABS = [
  { id: 'vessel-types', icon: Ship },
  { id: 'fuels', icon: Flame },
  { id: 'engines', icon: Wrench },
  { id: 'formulas', icon: FunctionSquare },
  { id: 'ports', icon: Anchor },
  { id: 'registry', icon: Search },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Reference data of the fleet service: readable by everyone, writable with reference:write. */
export function ReferenceDataPage() {
  const { t } = useTranslation('admin');
  const canWrite = usePermission('reference:write');
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabId = TABS.some((item) => item.id === requested)
    ? (requested as TabId)
    : 'vessel-types';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('common:nav.sections.settings')}
        title={t('referenceData.title')}
        description={t('referenceData.description')}
        icon={Database}
        actions={
          canWrite ? (
            <Badge variant="info">{t('referenceData.editable')}</Badge>
          ) : (
            <Badge variant="outline">
              <Lock aria-hidden /> {t('referenceData.readOnly')}
            </Badge>
          )
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) =>
          setParams(
            (current) => {
              const next = new URLSearchParams(current);
              next.set('tab', value);
              return next;
            },
            { replace: true },
          )
        }
        className="gap-4"
      >
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            {TABS.map(({ id, icon: Icon }) => (
              <TabsTrigger key={id} value={id}>
                <Icon aria-hidden /> {t(`referenceData.tabs.${id}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {TABS.map(({ id }) => (
          <TabsContent key={id} value={id} className="min-w-0 space-y-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                {t(`referenceData.tabs.${id}`)}
              </h2>
              <p className="text-sm text-muted-foreground">{t(`referenceData.hints.${id}`)}</p>
            </div>
            {id === 'vessel-types' && <VesselTypesTab canWrite={canWrite} />}
            {id === 'fuels' && <FuelsTab canWrite={canWrite} />}
            {id === 'engines' && <EnginesTab canWrite={canWrite} />}
            {id === 'formulas' && <FormulasTab canWrite={canWrite} />}
            {id === 'ports' && <PortsTab canWrite={canWrite} />}
            {id === 'registry' && <RegistryTab />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
