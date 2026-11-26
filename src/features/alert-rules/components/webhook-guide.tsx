import { KeyRound, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { MethodInfo } from '@/shared/domain-ui/method-info';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { CopyButton } from '@/shared/ui/copy-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

const NODE_SAMPLE = `import { createHmac, timingSafeEqual } from 'node:crypto';

// secrets: { [keyId]: 'whsec_…' }, the secret shown once per webhook channel
// rawBody: the exact bytes of the request body (before JSON parsing)
export function verifyAisItsWebhook(rawBody, headers, secrets) {
  const secret = secrets[headers['x-ais-its-key-id']];
  const timestamp = headers['x-ais-its-timestamp'];
  const signature = headers['x-ais-its-signature'] ?? '';
  if (!secret || !timestamp) return false;
  const expected =
    'sha256=' + createHmac('sha256', secret).update(\`\${timestamp}.\${rawBody}\`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) <= 300;
  return (
    fresh &&
    expected.length === signature.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}`;

const PYTHON_SAMPLE = `import hashlib, hmac, time

# secrets: {key_id: "whsec_…"}, the secret shown once per webhook channel
def verify_ais_its_webhook(raw_body: bytes, headers: dict, secrets: dict) -> bool:
    secret = secrets.get(headers.get("X-AIS-ITS-Key-Id", ""))
    timestamp = headers.get("X-AIS-ITS-Timestamp", "")
    signature = headers.get("X-AIS-ITS-Signature", "")
    if not secret or not timestamp:
        return False
    message = timestamp.encode() + b"." + raw_body
    expected = "sha256=" + hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    fresh = abs(time.time() - int(timestamp)) <= 300
    return fresh and hmac.compare_digest(expected, signature)`;

const SCROLL_REGION_TAB_INDEX = 0;

const HEADERS = [
  ['X-AIS-ITS-Timestamp', 'timestamp'],
  ['X-AIS-ITS-Signature', 'signature'],
  ['X-AIS-ITS-Key-Id', 'keyId'],
  ['X-AIS-ITS-Delivery', 'delivery'],
] as const;

function CodeBlock({ code, label }: { code: string; label: string }) {
  const { t } = useTranslation('alert-rules');
  return (
    <div className="relative min-w-0">
      <pre
        className="max-h-72 overflow-auto rounded-lg border bg-background/70 p-3 pr-12 font-mono text-xs leading-relaxed"
        // The sample scrolls in its own box: keyboard users must be able to reach it.
        tabIndex={SCROLL_REGION_TAB_INDEX}
        role="region"
        aria-label={label}
      >
        <code>{code}</code>
      </pre>
      <CopyButton value={code} label={t('webhook.copyCode')} className="absolute top-2 right-2" />
    </div>
  );
}

/**
 * How receivers verify signed webhook deliveries (services/notification/README.md, "Webhooks"):
 * HMAC-SHA256 over `<timestamp>.<raw body>` with the secret of the key named by
 * `X-AIS-ITS-Key-Id` (one key per webhook channel since notification 0.2).
 */
export function WebhookGuide({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('alert-rules');
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <ShieldCheck className="size-4" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="flex items-center gap-1 font-medium">
            {t('webhook.title')} <MethodInfo methodId="notify.webhook_signature" />
          </p>
          <p className="text-muted-foreground">{t('webhook.intro')}</p>
        </div>
      </div>
      <dl className="grid gap-2 rounded-lg border bg-background/40 p-3">
        {HEADERS.map(([header, key]) => (
          <div key={header} className="grid gap-0.5 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <dt className="font-mono text-xs font-semibold text-primary">{header}</dt>
            <dd className="text-xs text-muted-foreground">{t(`webhook.headers.${key}`)}</dd>
          </div>
        ))}
      </dl>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground marker:text-foreground">
        <li>{t('webhook.steps.raw')}</li>
        <li>{t('webhook.steps.hmac')}</li>
        <li>{t('webhook.steps.compare')}</li>
        <li>{t('webhook.steps.fresh')}</li>
        <li>{t('webhook.steps.dedupe')}</li>
      </ol>
      {!compact && (
        <p className="text-xs text-muted-foreground">
          {t('webhook.body')}{' '}
          <code className="font-mono text-foreground">
            {'{ deliveryId, event, sentAt, locale, rule, vessel, alert, link, text }'}
          </code>
        </p>
      )}
      <Tabs defaultValue="node" className="min-w-0">
        <TabsList>
          <TabsTrigger value="node">Node.js</TabsTrigger>
          <TabsTrigger value="python">Python</TabsTrigger>
        </TabsList>
        <TabsContent value="node">
          <CodeBlock code={NODE_SAMPLE} label={t('webhook.sample', { language: 'Node.js' })} />
        </TabsContent>
        <TabsContent value="python">
          <CodeBlock code={PYTHON_SAMPLE} label={t('webhook.sample', { language: 'Python' })} />
        </TabsContent>
      </Tabs>
      <Alert variant="info">
        <KeyRound aria-hidden />
        <AlertTitle>{t('webhook.secretTitle')}</AlertTitle>
        <AlertDescription>{t('webhook.secretText')}</AlertDescription>
      </Alert>
    </div>
  );
}
