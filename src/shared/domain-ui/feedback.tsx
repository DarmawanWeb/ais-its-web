import {
  CircleAlert,
  Construction,
  Inbox,
  type LucideIcon,
  RefreshCw,
  SearchX,
  ShieldX,
  WifiOff,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { type ApiProblem, isApiProblem, toApiProblem } from '@/shared/api/problem';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Compact variant for cards and table bodies. */
  size?: 'default' | 'sm';
}

/** Placeholder for "nothing here yet" (no data, no results, feature pending). */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  size = 'default',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        size === 'default' ? 'px-6 py-14' : 'px-4 py-8',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-muted text-muted-foreground ring-8 ring-muted/40',
          size === 'default' ? 'size-12' : 'size-9',
        )}
      >
        <Icon className={size === 'default' ? 'size-5' : 'size-4'} aria-hidden />
      </div>
      <div className="max-w-md space-y-1">
        <p className={cn('font-semibold', size === 'sm' && 'text-sm')}>{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  /** Any error; ApiProblem (RFC 9457 problem details) gets its title, detail and ids shown. */
  error?: unknown;
  title?: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  className?: string;
  size?: 'default' | 'sm';
  action?: ReactNode;
}

function problemCopy(
  problem: ApiProblem | null,
  t: TFunction,
): { icon: LucideIcon; title: string; description: string } {
  if (!problem) {
    return {
      icon: CircleAlert,
      title: t('errors.generic'),
      description: t('errors.genericDescription'),
    };
  }
  if (problem.kind === 'network') {
    return {
      icon: WifiOff,
      title: t('errors.network'),
      description: t('errors.networkDescription'),
    };
  }
  if (problem.kind === 'timeout') {
    return {
      icon: WifiOff,
      title: t('errors.timeout'),
      description: t('errors.networkDescription'),
    };
  }
  if (problem.status === 403) {
    return {
      icon: ShieldX,
      title: t('errors.forbidden'),
      description: problem.detail ?? t('errors.forbiddenDescription'),
    };
  }
  if (problem.status === 404) {
    return {
      icon: SearchX,
      title: problem.title || t('errors.notFound'),
      description: problem.detail ?? t('errors.notFoundDescription'),
    };
  }
  if (problem.status === 429) {
    return {
      icon: CircleAlert,
      title: t('errors.rateLimited'),
      description:
        problem.retryAfterSeconds !== undefined
          ? t('errors.rateLimitedRetry', { seconds: problem.retryAfterSeconds })
          : (problem.detail ?? ''),
    };
  }
  if (problem.status >= 500) {
    return {
      icon: CircleAlert,
      title: t('errors.server'),
      description: problem.detail ?? t('errors.genericDescription'),
    };
  }
  return {
    icon: CircleAlert,
    title: problem.title || t('errors.generic'),
    description: problem.detail ?? '',
  };
}

/** Renders an error, including RFC 9457 problem details (title, detail, field errors, ids). */
export function ErrorState({
  error,
  title,
  description,
  onRetry,
  className,
  size = 'default',
  action,
}: ErrorStateProps) {
  const { t } = useTranslation();
  const problem =
    error === undefined || error === null
      ? null
      : isApiProblem(error)
        ? error
        : toApiProblem(error);
  const copy = problemCopy(problem, t);
  const Icon = copy.icon;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        size === 'default' ? 'px-6 py-14' : 'px-4 py-8',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-danger/12 text-danger ring-8 ring-danger/5',
          size === 'default' ? 'size-12' : 'size-9',
        )}
      >
        <Icon className={size === 'default' ? 'size-5' : 'size-4'} aria-hidden />
      </div>
      <div className="max-w-md space-y-1">
        <p className={cn('font-semibold', size === 'sm' && 'text-sm')}>{title ?? copy.title}</p>
        {(description ?? copy.description) && (
          <p className="text-sm text-muted-foreground">{description ?? copy.description}</p>
        )}
        {problem && problem.errors.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-left text-xs text-muted-foreground">
            {problem.errors.map((fieldError) => (
              <li key={`${fieldError.field}:${fieldError.message}`}>
                <span className="font-mono text-foreground">{fieldError.field}</span>:{' '}
                {fieldError.message}
              </li>
            ))}
          </ul>
        )}
        {problem &&
          (problem.code || problem.traceId || problem.requestId) &&
          problem.kind === 'http' && (
            <p className="pt-1 font-mono text-[11px] text-muted-foreground/80">
              {problem.code}
              {problem.traceId && ` · ${t('errors.traceId')} ${problem.traceId}`}
              {!problem.traceId &&
                problem.requestId &&
                ` · ${t('errors.requestId')} ${problem.requestId}`}
            </p>
          )}
      </div>
      <div className="flex gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw /> {t('actions.retry')}
          </Button>
        )}
        {action}
      </div>
    </div>
  );
}

/** 403: the user lacks the permission for a page or section. */
export function ForbiddenState({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={ShieldX}
      title={t('errors.forbidden')}
      description={t('errors.forbiddenDescription')}
      className={className}
    />
  );
}

/** Placeholder of a page whose module is being built. */
export function UnderConstruction({
  module,
  className,
  children,
}: {
  module: string;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn('rounded-xl border border-dashed bg-surface/40', className)}>
      <EmptyState
        icon={Construction}
        title={t('status.underConstruction')}
        description={t('status.underConstructionDescription', { module })}
        action={children}
      />
    </div>
  );
}
