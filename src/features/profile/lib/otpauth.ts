/** Parts of an `otpauth://totp/<label>?secret=…&issuer=…` URI (Key Uri Format). */
export interface OtpauthInfo {
  readonly issuer: string | null;
  readonly account: string | null;
  readonly digits: number;
  readonly period: number;
  readonly algorithm: string;
}

/** Reads the label, issuer and parameters shown next to the QR code (never the secret). */
export function parseOtpauthUrl(url: string): OtpauthInfo | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'otpauth:') return null;
  // URL puts "totp" in the host and the label in the path for non-special schemes.
  const label = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  const [labelIssuer, labelAccount] = label.includes(':')
    ? (label.split(/:(.*)/s, 2) as [string, string])
    : [null, label];
  const issuer = parsed.searchParams.get('issuer') ?? labelIssuer;
  const digits = Number(parsed.searchParams.get('digits') ?? 6);
  const period = Number(parsed.searchParams.get('period') ?? 30);
  return {
    issuer: issuer?.trim() || null,
    account: labelAccount?.trim() || null,
    digits: Number.isFinite(digits) ? digits : 6,
    period: Number.isFinite(period) ? period : 30,
    algorithm: (parsed.searchParams.get('algorithm') ?? 'SHA1').toUpperCase(),
  };
}

/** A base32 secret in groups of four characters, easier to type into an authenticator. */
export function formatSecret(secret: string): string {
  return (
    secret
      .replace(/\s+/g, '')
      .toUpperCase()
      .match(/.{1,4}/g)
      ?.join(' ') ?? ''
  );
}

/** Digits only, at most `length` of them (one-time code inputs). */
export function normalizeOtp(value: string, length = 6): string {
  return value.replace(/\D+/g, '').slice(0, length);
}
