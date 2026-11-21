import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';
import { DayPicker, getDefaultClassNames, type DayButton } from 'react-day-picker';

import { cn } from '@/shared/lib/utils';

import { buttonVariants } from './button';

/** Calendar (react-day-picker 9) styled with the design tokens. */
export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('bg-transparent p-3 [--cell-size:--spacing(8)]', className)}
      classNames={{
        root: cn('w-fit', defaults.root),
        months: cn('relative flex flex-col gap-4 md:flex-row', defaults.months),
        month: cn('flex w-full flex-col gap-4', defaults.month),
        nav: cn(
          'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
          defaults.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
          defaults.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
          defaults.button_next,
        ),
        month_caption: cn(
          'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
          defaults.month_caption,
        ),
        caption_label: cn('text-sm font-medium select-none', defaults.caption_label),
        table: 'w-full border-collapse',
        weekdays: cn('flex', defaults.weekdays),
        weekday: cn(
          'flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none',
          defaults.weekday,
        ),
        week: cn('mt-2 flex w-full', defaults.week),
        day: cn(
          'group/day relative aspect-square h-full w-full p-0 text-center select-none [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md',
          defaults.day,
        ),
        range_start: cn('rounded-l-md bg-accent', defaults.range_start),
        range_middle: cn('rounded-none', defaults.range_middle),
        range_end: cn('rounded-r-md bg-accent', defaults.range_end),
        today: cn(
          'rounded-md bg-accent text-accent-foreground data-[selected=true]:rounded-none',
          defaults.today,
        ),
        outside: cn('text-muted-foreground aria-selected:text-muted-foreground', defaults.outside),
        disabled: cn('text-muted-foreground opacity-50', defaults.disabled),
        hidden: cn('invisible', defaults.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chevronClass, orientation, ...chevronProps }) => {
          if (orientation === 'left') {
            return <ChevronLeftIcon className={cn('size-4', chevronClass)} {...chevronProps} />;
          }
          if (orientation === 'right') {
            return <ChevronRightIcon className={cn('size-4', chevronClass)} {...chevronProps} />;
          }
          return <ChevronDownIcon className={cn('size-4', chevronClass)} {...chevronProps} />;
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        buttonVariants({ variant: 'ghost' }),
        'flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal tabular-nums group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 data-[range-end=true]:rounded-md data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:rounded-md data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground',
        className,
      )}
      {...props}
    />
  );
}
