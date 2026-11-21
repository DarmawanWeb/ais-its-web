import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';

interface AttributionSource {
  label: string;
  url: string;
  license?: string;
  licenseUrl?: string;
}

/**
 * Mandatory data attributions (spec §17). Render `<DataAttribution provider="open-meteo" />`
 * wherever weather-derived values are shown ("Weather data by Open-Meteo.com", CC BY 4.0).
 */
export function DataAttribution({
  provider = 'open-meteo',
  source,
  className,
}: {
  provider?: 'open-meteo';
  /** A custom source instead of a known provider. */
  source?: AttributionSource;
  className?: string;
}) {
  const { t } = useTranslation();
  const resolved: AttributionSource = source ?? {
    label: t('attribution.weather'),
    url: 'https://open-meteo.com/',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  };
  return (
    <p
      className={cn('text-[11px] leading-tight text-muted-foreground', className)}
      data-provider={source ? 'custom' : provider}
    >
      <a
        href={resolved.url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline-offset-2 hover:text-foreground hover:underline"
      >
        {resolved.label}
      </a>
      {resolved.license && (
        <>
          {' · '}
          {resolved.licenseUrl ? (
            <a
              href={resolved.licenseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              {resolved.license}
            </a>
          ) : (
            resolved.license
          )}
        </>
      )}
    </p>
  );
}
