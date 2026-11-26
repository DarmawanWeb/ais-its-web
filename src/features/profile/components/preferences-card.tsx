import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Section } from '@/shared/domain-ui/section';
import { APP_LANGUAGES, type AppLanguage, setLanguage } from '@/shared/i18n';
import { cn } from '@/shared/lib/utils';
import { type ThemePreference, useUiStore } from '@/shared/stores/ui-store';
import { Label } from '@/shared/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';

const THEMES: readonly { value: ThemePreference; icon: typeof Sun }[] = [
  { value: 'dark', icon: Moon },
  { value: 'light', icon: Sun },
  { value: 'system', icon: Monitor },
];

/** Language and theme of this browser (stored locally, like the top bar toggles). */
export function PreferencesCard() {
  const { t, i18n } = useTranslation('profile');
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const language: AppLanguage = i18n.language === 'en' ? 'en' : 'id';

  return (
    <Section title={t('preferences.title')} description={t('preferences.description')}>
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('preferences.language')}</legend>
          <RadioGroup
            value={language}
            onValueChange={(value) => void setLanguage(value as AppLanguage)}
            className="grid gap-2"
          >
            {APP_LANGUAGES.map((code) => (
              <Label
                key={code}
                htmlFor={`language-${code}`}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border bg-background/40 px-3 py-2.5 font-normal transition-colors hover:bg-accent/50',
                  language === code && 'border-primary/60 bg-primary/8',
                )}
              >
                <RadioGroupItem id={`language-${code}`} value={code} />
                <span className="w-6 font-mono text-xs text-muted-foreground uppercase">
                  {code}
                </span>
                <span className="flex-1 text-sm">{t(`common:shell.language.${code}`)}</span>
                {language === code && <Check className="size-4 text-primary" aria-hidden />}
              </Label>
            ))}
          </RadioGroup>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('preferences.theme')}</legend>
          <RadioGroup
            value={theme}
            onValueChange={(value) => setTheme(value as ThemePreference)}
            className="grid grid-cols-3 gap-2"
          >
            {THEMES.map(({ value, icon: Icon }) => (
              <Label
                key={value}
                htmlFor={`theme-${value}`}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border bg-background/40 px-2 py-3 text-center text-xs font-normal transition-colors hover:bg-accent/50 has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50',
                  theme === value && 'border-primary/60 bg-primary/8 text-foreground',
                )}
              >
                <RadioGroupItem id={`theme-${value}`} value={value} className="sr-only" />
                <Icon
                  className={cn(
                    'size-4',
                    theme === value ? 'text-primary' : 'text-muted-foreground',
                  )}
                  aria-hidden
                />
                {t(`common:shell.theme.${value}`)}
              </Label>
            ))}
          </RadioGroup>
        </fieldset>
        <p className="text-xs text-muted-foreground">{t('preferences.localHint')}</p>
      </div>
    </Section>
  );
}
