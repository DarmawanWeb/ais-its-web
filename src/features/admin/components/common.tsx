import { Building2, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

import { ALL_ORGANIZATIONS, type OrgContext } from '../hooks/use-org-context';

/** Organization of the page: a picker for platform administrators, a label for everyone else. */
export function OrgContextPicker({
  context,
  allowAll = false,
}: {
  context: OrgContext;
  allowAll?: boolean;
}) {
  const { t } = useTranslation('admin');
  if (!context.isPlatformAdmin) {
    return (
      <Badge variant="outline" className="h-8 gap-1.5 px-2.5 text-sm font-normal">
        <Building2 className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="sr-only">{t('common.organization')}: </span>
        {context.orgName ?? t('common.noOrganization')}
      </Badge>
    );
  }
  return (
    <Select
      value={context.orgId ?? ALL_ORGANIZATIONS}
      onValueChange={(value) => context.setOrgId(value === ALL_ORGANIZATIONS ? null : value)}
    >
      <SelectTrigger className="w-full sm:w-64" aria-label={t('common.organization')}>
        <Building2 className="text-muted-foreground" aria-hidden />
        <SelectValue placeholder={t('common.chooseOrganization')} />
      </SelectTrigger>
      <SelectContent>
        {allowAll && (
          <SelectItem value={ALL_ORGANIZATIONS}>{t('common.allOrganizations')}</SelectItem>
        )}
        {context.options.map((org) => (
          <SelectItem key={org.id} value={org.id}>
            {org.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Search input of list toolbars. */
export function SearchInput({
  value,
  onChange,
  label,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        placeholder={placeholder}
        className="pl-8"
      />
    </div>
  );
}
