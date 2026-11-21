import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { formatNumber } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';

import type { CursorPagination, LoadMorePagination, PagePagination } from './adapters';

const DEFAULT_PAGE_SIZES = [10, 20, 50, 100] as const;

export function PagePaginationBar({ pagination }: { pagination: PagePagination }) {
  const { t, i18n } = useTranslation();
  const { page, pageSize, total, onPageChange, onPageSizeChange } = pagination;
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm">
      <p className="text-muted-foreground tabular-nums">
        {t('table.total', { total: formatNumber(total, i18n.language) })}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('table.rowsPerPage')}</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger size="sm" className="w-[4.5rem]" aria-label={t('table.rowsPerPage')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(pagination.pageSizeOptions ?? DEFAULT_PAGE_SIZES).map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <span className="text-muted-foreground tabular-nums">
          {t('table.pageOf', { page, pageCount })}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            aria-label={t('table.first')}
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label={t('table.previous')}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label={t('table.next')}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(pageCount)}
            disabled={page >= pageCount}
            aria-label={t('table.last')}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CursorPaginationBar({ pagination }: { pagination: CursorPagination }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-end gap-3 px-1 text-sm">
      {pagination.isFetching && <Spinner className="text-muted-foreground" />}
      <span className="text-muted-foreground tabular-nums">
        {t('table.pageNoTotal', { page: pagination.pageIndex + 1 })}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={pagination.onPrevious}
          disabled={!pagination.hasPreviousPage}
        >
          <ChevronLeft /> {t('table.previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={pagination.onNext}
          disabled={!pagination.hasNextPage}
        >
          {t('table.next')} <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function LoadMoreBar({ pagination }: { pagination: LoadMorePagination }) {
  const { t } = useTranslation();
  if (!pagination.hasNextPage) return null;
  return (
    <div className="flex justify-center">
      <Button
        variant="outline"
        size="sm"
        onClick={pagination.onLoadMore}
        disabled={pagination.isFetchingNextPage}
      >
        {pagination.isFetchingNextPage && <Spinner />}
        {t('table.loadMore')}
      </Button>
    </div>
  );
}
