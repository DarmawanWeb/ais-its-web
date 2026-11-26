/** Count of the bell badge: "99+" beyond 99. */
export function badgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** Shortened UUID for people-facing text (`0192f0c8…5b6a`). */
export function shortId(id: string): string {
  return id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}
