import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';

async function loadKatex() {
  const [katex] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
  return katex.default;
}

/**
 * True while the element scrolls (content wider, or taller, than the box: `overflow-x: auto`
 * makes the other axis scrollable too, and tall KaTeX glyphs can exceed the line box).
 */
function useOverflow(element: HTMLElement | null, content: string): boolean {
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    if (!element) return;
    const update = () =>
      setOverflowing(
        element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
      );
    update();
    // KaTeX fonts load after the first render and widen the content without resizing the box.
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    let active = true;
    void fonts?.ready.then(() => active && update());
    fonts?.addEventListener('loadingdone', update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      active = false;
      fonts?.removeEventListener('loadingdone', update);
      observer?.disconnect();
    };
  }, [element, content]);
  return overflowing;
}

/**
 * Renders LaTeX with KaTeX (lazy loaded); shows the source while KaTeX loads. Display
 * formulas never widen their container: they scroll horizontally, and a scrolling formula is
 * keyboard focusable (WCAG 2.1.1) with an accessible name.
 */
export function Formula({
  latex,
  displayMode = true,
  className,
}: {
  latex: string;
  displayMode?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  // Callback ref (state setter): the overflow observer follows the rendered element.
  const [element, setElement] = useState<HTMLSpanElement | null>(null);
  const { data: katex } = useQuery({
    queryKey: ['lib', 'katex'],
    queryFn: loadKatex,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
  const html = katex
    ? katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        output: 'htmlAndMathml',
        strict: 'ignore',
      })
    : '';
  const scrollable = useOverflow(displayMode ? element : null, html);

  if (!katex) {
    return (
      <code className={cn('font-mono text-xs break-all text-muted-foreground', className)}>
        {latex}
      </code>
    );
  }
  return (
    <span
      ref={setElement}
      className={cn(
        displayMode ? 'block max-w-full overflow-x-auto py-1' : 'inline',
        scrollable && 'rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      {...(scrollable
        ? { tabIndex: 0, role: 'group', 'aria-label': t('method.formulaScrollable') }
        : {})}
      // KaTeX escapes its input and `trust` is off, so the markup is safe to inject.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
