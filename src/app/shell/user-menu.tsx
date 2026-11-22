import { ROLE_LABELS } from '@darmawanweb/ais-its-contracts/auth';
import { LogOut, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useSession } from '@/shared/auth/hooks';
import { AUTH_PATHS } from '@/shared/auth/paths';
import { logout } from '@/shared/auth/session';
import { Avatar, AvatarFallback, initials } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

export function UserMenu() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const locale = i18n.language === 'en' ? 'en' : 'id';
  const displayName = session.name || session.email;
  const userInitials = initials(displayName);

  // The local session ends at once; an unfinished server revocation is reported by the
  // LogoutPendingNotice (app providers) on the login page.
  const signOut = () => {
    setBusy(true);
    void logout();
    void navigate(AUTH_PATHS.login, { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          // The name starts with the visible initials (WCAG 2.5.3: speech input users say "DA").
          aria-label={`${userInitials} · ${t('shell.userMenu')} (${displayName})`}
          data-testid="user-menu"
        >
          <Avatar className="size-8 ring-1 ring-border">
            <AvatarFallback>{userInitials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1.5 py-2">
          <span className="truncate text-sm font-semibold">{session.name || session.email}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {session.email}
          </span>
          {session.roles.length > 0 && (
            <span className="flex flex-wrap gap-1 pt-0.5">
              {session.roles.map((role) => (
                <Badge key={role} variant="primary" className="text-[10px]">
                  {ROLE_LABELS[role][locale]}
                </Badge>
              ))}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate('/profile')}>
          <UserRound /> {t('shell.profile')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={busy}
          onSelect={(event) => {
            event.preventDefault();
            signOut();
          }}
          data-testid="logout"
        >
          <LogOut /> {busy ? t('shell.loggingOut') : t('shell.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
