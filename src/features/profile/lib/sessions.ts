/** Kind of device behind a session (icon of the session list). */
export type DeviceKind = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export interface UserAgentInfo {
  /** Browser family, e.g. "Chrome", "Firefox"; null when unknown. */
  readonly browser: string | null;
  /** Operating system, e.g. "Windows", "macOS", "Android"; null when unknown. */
  readonly os: string | null;
  readonly device: DeviceKind;
}

const BROWSERS: readonly [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
  [/curl\//i, 'curl'],
  [/PostmanRuntime\//, 'Postman'],
];

const SYSTEMS: readonly [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

/** Browser, OS and device kind of a User-Agent header (best effort, for display only). */
export function parseUserAgent(userAgent: string | null | undefined): UserAgentInfo {
  if (!userAgent) return { browser: null, os: null, device: 'unknown' };
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
  const os = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
  const tablet = /iPad|Tablet|(Android(?!.*Mobile))/.test(userAgent);
  const mobile = !tablet && /Mobi|iPhone|iPod|Android/.test(userAgent);
  const device: DeviceKind = tablet
    ? 'tablet'
    : mobile
      ? 'mobile'
      : browser || os
        ? 'desktop'
        : 'unknown';
  return { browser, os, device };
}

/** Sessions with the current one first, then the most recently used. */
export function sortSessions<T extends { current: boolean; lastUsedAt: string }>(
  sessions: readonly T[],
): T[] {
  return [...sessions].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt);
  });
}
