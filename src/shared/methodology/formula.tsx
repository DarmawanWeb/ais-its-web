import { useQuery } from '@tanstack/react-query';

import { cn } from '@/shared/lib/utils';

async function loadKatex() {
  const [katex] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
  return katex.default;
}

/** Renders LaTeX with KaTeX (lazy loaded); shows the source while KaTeX loads. */
export function Formula({
  latex,
  displayMode = true,
  className,
}: {
  latex: string;
  displayMode?: boolean;
  className?: string;
}) {
  const { data: katex } = useQuery({
    queryKey: ['lib', 'katex'],
    queryFn: loadKatex,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  if (!katex) {
    return (
      <code className={cn('font-mono text-xs break-all text-muted-foreground', className)}>
        {latex}
      </code>
    );
  }
  const html = katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    output: 'htmlAndMathml',
    strict: 'ignore',
  });
  return (
    <span
      className={cn(displayMode ? 'block overflow-x-auto py-1' : 'inline', className)}
      // KaTeX escapes its input and `trust` is off, so the markup is safe to inject.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
