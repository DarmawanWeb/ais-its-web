import { useQuery } from '@tanstack/react-query';
import { LogOut, Moon, Languages, Ship } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import * as z from 'zod';
import { create } from 'zustand';

import { http } from '@/shared/api/http';
import { isApiProblem } from '@/shared/api/problem';
import { sharedKeys } from '@/shared/api/query-keys';
import { usePermission, usePermissions } from '@/shared/auth/hooks';
import { AUTH_PATHS } from '@/shared/auth/paths';
import { logout } from '@/shared/auth/session';
import { MmsiText } from '@/shared/domain-ui/values';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { setLanguage } from '@/shared/i18n';
import { useUiStore } from '@/shared/stores/ui-store';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/shared/ui/command';
import { Spinner } from '@/shared/ui/spinner';

import { features } from '../features';
import { buildCommands } from '../navigation';
import { useNavigationSections } from './sidebar';

interface CommandPaletteState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** Element focused when the palette opened (focus goes back there, or to the page). */
let opener: HTMLElement | null = null;

export const useCommandPalette = create<CommandPaletteState>((set, get) => ({
  open: false,
  setOpen: (open) => {
    if (open && !get().open && typeof document !== 'undefined') {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    set({ open });
  },
}));

/** Moves focus to the content area (the new page) instead of leaving it on <body>. */
function focusMainContent(): void {
  document.getElementById('main-content')?.focus({ preventScroll: true });
}

const VesselSearchSchema = z.looseObject({
  data: z.array(
    z.looseObject({
      id: z.string().optional(),
      mmsi: z.number(),
      imo: z.union([z.string(), z.number()]).nullish(),
      name: z.string().nullish(),
      flag: z.string().nullish(),
    }),
  ),
});

/** GET /api/v2/vessels?search= (fleet service, spec §13.3). */
async function searchVessels(term: string, signal: AbortSignal) {
  const { data } = await http.get<unknown>('/api/v2/vessels', {
    params: { search: term, pageSize: 8 },
    signal,
  });
  return VesselSearchSchema.parse(data).data;
}

/** Global command palette (Ctrl/Cmd+K): pages, vessels (name / MMSI) and actions. */
export function CommandPalette() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const open = useCommandPalette((state) => state.open);
  const setOpen = useCommandPalette((state) => state.setOpen);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const canReadVessels = usePermission('vessel:read');
  const permissions = usePermissions();
  const sections = useNavigationSections();
  const commands = useMemo(() => buildCommands(features, permissions), [permissions]);
  const [query, setQuery] = useState('');
  const term = useDebouncedValue(query.trim(), 250);
  /** The palette closed because an entry was selected (a page or an action). */
  const selected = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(!useCommandPalette.getState().open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);

  const vessels = useQuery({
    queryKey: sharedKeys.vesselSearch(term),
    queryFn: ({ signal }) => searchVessels(term, signal),
    enabled: open && canReadVessels && term.length >= 2,
    staleTime: 30_000,
    retry: false,
  });
  const vesselSearchUnavailable =
    vessels.isError &&
    isApiProblem(vessels.error) &&
    (vessels.error.status === 404 || vessels.error.kind !== 'http');

  const run = (action: () => void) => {
    selected.current = true;
    setOpen(false);
    setQuery('');
    action();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
      title={t('command.title')}
      description={t('command.description')}
      onCloseAutoFocus={(event) => {
        // After a selection (navigation) or when the palette was opened with Ctrl/Cmd+K from
        // nowhere, focus the content area; otherwise Radix returns focus to the opener.
        const toPage = selected.current || !opener?.isConnected || opener === document.body;
        selected.current = false;
        if (!toPage) return;
        event.preventDefault();
        focusMainContent();
      }}
    >
      <CommandInput placeholder={t('command.placeholder')} value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{t('command.empty')}</CommandEmpty>
        {canReadVessels && term.length >= 2 && (
          <CommandGroup heading={t('command.vessels')}>
            {vessels.isFetching && (
              <CommandItem disabled value={`__searching ${term}`}>
                <Spinner /> {t('command.searchingVessels')}
              </CommandItem>
            )}
            {vesselSearchUnavailable && (
              <CommandItem disabled value={`__unavailable ${term}`}>
                <Ship /> {t('command.vesselSearchUnavailable')}
              </CommandItem>
            )}
            {vessels.data?.map((vessel) => (
              <CommandItem
                key={vessel.mmsi}
                value={`${vessel.name ?? ''} ${vessel.mmsi} ${vessel.imo ?? ''}`}
                onSelect={() => run(() => void navigate(`/vessels/${vessel.mmsi}`))}
              >
                <Ship />
                <span className="truncate">{vessel.name ?? `MMSI ${vessel.mmsi}`}</span>
                <CommandShortcut className="tracking-normal">
                  <MmsiText mmsi={vessel.mmsi} />
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {sections.map((section) => (
          <CommandGroup key={section.id} heading={t(section.labelKey)}>
            {section.items.map((item) => (
              <CommandItem
                key={item.id}
                value={`${t(item.labelKey)} ${t(section.labelKey)} ${item.path} ${(item.keywords ?? []).join(' ')}`}
                onSelect={() => run(() => void navigate(item.path))}
              >
                <item.icon />
                {t(item.labelKey)}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {commands.length > 0 && (
          <CommandGroup heading={t('command.actions')}>
            {commands.map((command) => (
              <CommandItem
                key={command.id}
                value={`${t(command.labelKey)} ${(command.keywords ?? []).join(' ')}`}
                onSelect={() => run(() => command.perform({ navigate }))}
              >
                {command.icon && <command.icon />}
                {t(command.labelKey)}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading={t('command.actions')}>
          <CommandItem value="theme tema dark light gelap terang" onSelect={() => run(toggleTheme)}>
            <Moon /> {t('command.toggleTheme')}
          </CommandItem>
          <CommandItem
            value="language bahasa english indonesia"
            onSelect={() => run(() => void setLanguage(i18n.language === 'en' ? 'id' : 'en'))}
          >
            <Languages /> {t('command.switchLanguage')}
          </CommandItem>
          <CommandItem
            value="logout keluar sign out"
            onSelect={() =>
              run(() => {
                void logout();
                void navigate(AUTH_PATHS.login, { replace: true });
              })
            }
          >
            <LogOut /> {t('command.logout')}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
