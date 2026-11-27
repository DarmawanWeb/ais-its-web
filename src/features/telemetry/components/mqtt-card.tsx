import { TELEMETRY_MQTT_TOPIC_PREFIX } from '@darmawanweb/ais-its-contracts/events';
import { RadioTower } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { MethodInfo } from '@/shared/domain-ui/method-info';
import { Section } from '@/shared/domain-ui/section';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import { devicePayloadJsonSchema, examplePayload } from '../lib/mqtt';
import { nowMs } from '@/shared/lib/clock';
import { CopyText } from '@/shared/ui/copy-text';

/**
 * How fuel meters report: MQTT topic `aisits/telemetry/<deviceId>` (NATS MQTT gateway) with the
 * payload schema of the contracts, or HTTP with the device's API key.
 */
export function MqttCard({ mmsi }: { mmsi: number | null }) {
  const { t } = useTranslation('telemetry');
  const schema = useMemo(() => devicePayloadJsonSchema(), []);
  const example = useMemo(() => examplePayload(nowMs()), []);
  const topic = `${TELEMETRY_MQTT_TOPIC_PREFIX}<deviceId>`;
  const http = [
    `curl -X POST "$AIS_ITS_URL/api/v2/telemetry/readings" \\`,
    `  -H "X-API-Key: $DEVICE_API_KEY" -H "Content-Type: application/json" \\`,
    `  -d '[{"mmsi":${mmsi ?? 525005223},"time":"2026-11-21T10:00:00Z","fuelMeTon":0.42,"fuelAeTon":0.05}]'`,
  ].join('\n');
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          <RadioTower className="size-4 text-primary" aria-hidden /> {t('mqtt.title')}
        </span>
      }
      description={t('mqtt.description')}
    >
      <Tabs defaultValue="mqtt" className="gap-4">
        <TabsList aria-label={t('mqtt.channels')}>
          <TabsTrigger value="mqtt">MQTT</TabsTrigger>
          <TabsTrigger value="http">HTTP</TabsTrigger>
        </TabsList>
        <TabsContent value="mqtt" className="grid gap-4">
          <div className="grid gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t('mqtt.topic')}</p>
            <CopyText label={t('mqtt.topic')} value={topic} />
            <p className="text-xs text-muted-foreground">{t('mqtt.topicHint')}</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid min-w-0 content-start gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t('mqtt.example')}</p>
              <CopyText label={t('mqtt.example')} value={example} multiline />
            </div>
            <div className="grid min-w-0 content-start gap-1.5">
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                {t('mqtt.schema')} <MethodInfo methodId="telemetry.reading_validation" />
              </p>
              <CopyText label={t('mqtt.schema')} value={schema} multiline />
            </div>
          </div>
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {(t('mqtt.rules', { returnObjects: true }) as string[]).map((rule) => (
              <li key={rule} className="flex gap-2">
                <span aria-hidden>•</span>
                {rule}
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="http" className="grid gap-2">
          <p className="text-xs text-muted-foreground">{t('mqtt.httpHint')}</p>
          <CopyText label={t('mqtt.httpExample')} value={http} multiline />
        </TabsContent>
      </Tabs>
    </Section>
  );
}
