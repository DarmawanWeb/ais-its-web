import { Check, Languages, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { APP_LANGUAGES, setLanguage } from '@/shared/i18n';
import { useUiStore } from '@/shared/stores/ui-store';
import { useResolvedTheme } from '@/shared/theme/theme';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SimpleTooltip } from '@/shared/ui/tooltip';

export function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const label = `${t('shell.theme.toggle')}: ${theme === 'dark' ? t('shell.theme.light') : t('shell.theme.dark')}`;
  return (
    <SimpleTooltip label={label}>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={toggleTheme}
        aria-label={label}
        data-testid="theme-toggle"
      >
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>
    </SimpleTooltip>
  );
}

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('shell.language.toggle')}
          className="gap-1.5 px-2 font-mono text-xs uppercase"
          data-testid="language-toggle"
        >
          <Languages className="size-4" />
          {i18n.language}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t('shell.language.label')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {APP_LANGUAGES.map((language) => (
          <DropdownMenuItem key={language} onSelect={() => void setLanguage(language)}>
            <span className="w-6 font-mono text-xs text-muted-foreground uppercase">
              {language}
            </span>
            {t(`shell.language.${language}`)}
            {i18n.language === language && <Check className="ml-auto size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
