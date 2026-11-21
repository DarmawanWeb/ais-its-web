import { Anchor, Flame, Radar, ShieldCheck, Waves } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useMatches } from 'react-router';

import { appConfig } from '@/shared/config/env';
import { BrandLogo } from '@/shared/domain-ui/brand';
import { LanguageToggle, ThemeToggle } from '@/shared/domain-ui/preference-toggles';
import type { AppRouteHandle } from '@/shared/feature';

import { MaritimeVisual } from './maritime-visual';

const CAPABILITIES = [
  { key: 'tracking', icon: Radar },
  { key: 'ews', icon: Flame },
  { key: 'surveillance', icon: Anchor },
  { key: 'emission', icon: Waves },
] as const;

/** Split-screen layout of the public auth pages: maritime scene + form column. */
export function AuthLayout() {
  const { t } = useTranslation('auth');
  const matches = useMatches();
  const titleKey = [...matches]
    .reverse()
    .map((match) => (match.handle as AppRouteHandle | undefined)?.titleKey)
    .find(Boolean);

  useEffect(() => {
    const app = t('common:app.name');
    document.title = titleKey ? `${t(titleKey)} · ${app}` : app;
  }, [t, titleKey]);

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-[#030a14] lg:block">
        <MaritimeVisual className="absolute inset-0 size-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#030a14] via-[#030a14]/55 to-[#030a14]/10" />
        <div className="relative z-10 flex h-full flex-col justify-between p-10 text-white xl:p-14">
          <BrandLogo className="[&_span]:text-white/95" />
          <div className="max-w-xl space-y-6">
            <h2 className="text-3xl leading-[1.15] font-semibold tracking-tight text-balance xl:text-4xl">
              {t('visual.headline')}
            </h2>
            <p className="max-w-lg text-[15px] leading-relaxed text-slate-300">
              {t('visual.description')}
            </p>
            <ul className="flex flex-wrap gap-2">
              {CAPABILITIES.map(({ key, icon: Icon }) => (
                <li
                  key={key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-1 text-xs font-medium text-cyan-100 backdrop-blur-sm"
                >
                  <Icon className="size-3.5 text-cyan-300" aria-hidden />
                  {t(`visual.capabilities.${key}`)}
                </li>
              ))}
            </ul>
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="size-4 text-emerald-400" aria-hidden />
              {t('visual.secure')}
            </p>
          </div>
        </div>
      </aside>
      <main className="flex min-h-dvh flex-col">
        <div className="flex items-center justify-between gap-2 p-4 sm:p-6">
          <BrandLogo className="lg:invisible" />
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-10 sm:px-6">
          <div className="w-full max-w-[380px]">
            <Outlet />
          </div>
        </div>
        <footer className="px-6 pb-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} AIS Maritime Intelligence · v{appConfig.appVersion}
        </footer>
      </main>
    </div>
  );
}
