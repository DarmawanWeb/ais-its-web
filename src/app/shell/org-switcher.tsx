import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import * as z from 'zod';

import { http } from '@/shared/api/http';
import { sharedKeys } from '@/shared/api/query-keys';
import { useMe, usePermission, useSession } from '@/shared/auth/hooks';
import { switchOrganization } from '@/shared/auth/session';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Spinner } from '@/shared/ui/spinner';

const OrganizationListSchema = z.looseObject({
  data: z.array(z.looseObject({ id: z.string(), name: z.string(), kind: z.string().optional() })),
});

/** All organizations (super_admin, org:manage) — GET /api/v2/organizations. */
async function fetchOrganizations() {
  const { data } = await http.get<unknown>('/api/v2/organizations', { params: { pageSize: 100 } });
  return OrganizationListSchema.parse(data).data;
}

interface OrgOption {
  orgId: string;
  name: string;
  detail: string | null;
}

/** Organization switcher (POST /api/v2/auth/switch-org). */
export function OrgSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const session = useSession();
  const canListAll = usePermission('org:manage');
  useMe();
  const organizations = useQuery({
    queryKey: sharedKeys.organizations(),
    queryFn: fetchOrganizations,
    enabled: canListAll && session.isAuthenticated,
    staleTime: 60_000,
    retry: false,
  });

  const options = useMemo<OrgOption[]>(() => {
    const byId = new Map<string, OrgOption>();
    for (const membership of session.memberships) {
      byId.set(membership.orgId, {
        orgId: membership.orgId,
        name: membership.orgName,
        detail: membership.role,
      });
    }
    for (const org of organizations.data ?? []) {
      if (!byId.has(org.id))
        byId.set(org.id, { orgId: org.id, name: org.name, detail: org.kind ?? null });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [session.memberships, organizations.data]);

  const switchOrg = useMutation({
    mutationFn: (orgId: string) => switchOrganization(orgId),
    onSuccess: (_claims, orgId) => {
      const name = options.find((option) => option.orgId === orgId)?.name ?? orgId;
      toast.success(t('shell.organization.switched', { name }));
    },
    onError: (error) => {
      toast.error(t('shell.organization.failed'), { description: error.detail ?? error.title });
    },
  });

  const current = options.find((option) => option.orgId === session.orgId);
  const label =
    current?.name ??
    (session.orgId ? t('shell.organization.label') : t('shell.organization.platform'));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('max-w-56 gap-2 bg-surface/60', className)}
          aria-label={`${t('shell.organization.switch')}: ${label}`}
          data-testid="org-switcher"
        >
          {switchOrg.isPending ? <Spinner /> : <Building2 className="text-primary" />}
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-auto opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t('shell.organization.switch')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 && (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            {t('shell.organization.empty')}
          </div>
        )}
        {options.map((option) => {
          const active = option.orgId === session.orgId;
          return (
            <DropdownMenuItem
              key={option.orgId}
              disabled={switchOrg.isPending}
              onSelect={() => {
                if (!active) switchOrg.mutate(option.orgId);
              }}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/12 text-[10px] font-bold text-primary uppercase">
                {option.name.slice(0, 2)}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{option.name}</span>
                {option.detail && (
                  <span className="truncate text-[11px] text-muted-foreground">
                    {option.detail}
                  </span>
                )}
              </span>
              {active && <Check className="ml-auto text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
