/**
 * The token arrives in the URL fragment (`#token=…`, spec §13.1 — never sent to servers or
 * access logs); `?token=` is accepted too. It is removed from the address bar right away.
 */
export function readLinkToken(hash: string, search: string): string | null {
  const fromHash = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  const fromQuery = new URLSearchParams(search).get('token');
  return fromHash || fromQuery || null;
}
