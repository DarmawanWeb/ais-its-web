import { createRequestId } from '@/shared/lib/utils';

/**
 * Cross-tab mutual exclusion for the refresh-token rotation and sign-out: presenting a refresh
 * cookie that another tab already rotated revokes the whole session family (spec §8.3), so only
 * one tab may call POST /auth/refresh or /auth/logout at a time.
 *
 * Uses the Web Locks API. Browsers expose it only in secure contexts (HTTPS or localhost); on
 * plain HTTP elsewhere (COOKIE_SECURE=false setups) a localStorage lease with expiry takes
 * over. Serve the console over HTTPS (or localhost) in production.
 */
export async function withCrossTabLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks && typeof locks.request === 'function') return locks.request(name, task);
  warnNoWebLocks();
  return withStorageLease(name, task);
}

let warned = false;
function warnNoWebLocks(): void {
  if (warned || import.meta.env.MODE === 'test') return;
  warned = true;
  console.warn(
    '[auth] Web Locks API unavailable (not a secure context): falling back to a localStorage lock between tabs. Serve the console over HTTPS or localhost.',
  );
}

export interface StorageLeaseOptions {
  /** Lease lifetime: a tab that dies holding the lease blocks the others at most this long. */
  ttlMs?: number;
  /** Time concurrent writers get to settle before the owner is read back. */
  settleMs?: number;
  /** Base polling interval while another tab holds the lease (jittered). */
  pollMs?: number;
  /** Upper bound on waiting; afterwards the task runs anyway (never blocks the session). */
  maxWaitMs?: number;
}

interface Lease {
  owner: string;
  expires: number;
}

const LEASE_PREFIX = 'ais-lock:';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function readLease(storage: Storage, key: string): Lease | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Lease> | null;
    return typeof value?.owner === 'string' && typeof value.expires === 'number'
      ? { owner: value.owner, expires: value.expires }
      : null;
  } catch {
    return null;
  }
}

/**
 * localStorage mutex with expiry (fallback of withCrossTabLock): write the lease when it is
 * free or expired, wait for concurrent writers to settle, and own it only if the read-back
 * still names this caller (the last writer wins). Exported for tests.
 */
export async function withStorageLease<T>(
  name: string,
  task: () => Promise<T>,
  { ttlMs = 35_000, settleMs = 40, pollMs = 100, maxWaitMs = 45_000 }: StorageLeaseOptions = {},
): Promise<T> {
  let storage: Storage;
  try {
    storage = window.localStorage;
    storage.getItem(LEASE_PREFIX);
  } catch {
    return task(); // storage blocked: nothing to coordinate with
  }
  const key = `${LEASE_PREFIX}${name}`;
  const owner = createRequestId();
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const lease = readLease(storage, key);
    if (!lease || lease.expires <= Date.now()) {
      try {
        storage.setItem(key, JSON.stringify({ owner, expires: Date.now() + ttlMs }));
      } catch {
        return task(); // quota or blocked storage
      }
      await sleep(settleMs);
      if (readLease(storage, key)?.owner === owner) break;
    }
    if (Date.now() >= deadline) break;
    await sleep(pollMs + Math.random() * pollMs);
  }
  try {
    return await task();
  } finally {
    if (readLease(storage, key)?.owner === owner) storage.removeItem(key);
  }
}
