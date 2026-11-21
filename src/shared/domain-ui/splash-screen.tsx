import { BrandMark } from './brand';

/** Full-screen loader shown while the session is restored. */
export function SplashScreen() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        <span
          className="absolute inset-0 animate-pulse-ring rounded-xl bg-primary/40"
          aria-hidden
        />
        <BrandMark className="relative size-12 rounded-xl" />
      </div>
      <div className="h-0.5 w-40 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-progress rounded-full bg-primary" />
      </div>
      <span className="sr-only">Loading AIS Maritime Intelligence…</span>
    </div>
  );
}
