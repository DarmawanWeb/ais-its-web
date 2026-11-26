import { describe, expect, it } from 'vitest';

import { formatSecret, normalizeOtp, parseOtpauthUrl } from './otpauth';
import { checkPasswordRules, meetsPasswordPolicy, passwordStrength } from './password-policy';
import { parseUserAgent, sortSessions } from './sessions';

describe('password policy', () => {
  it('requires 10 characters with a letter and a digit, at most 128', () => {
    expect(checkPasswordRules('kapal')).toEqual({
      length: false,
      letter: true,
      digit: false,
      maxLength: true,
    });
    expect(meetsPasswordPolicy('Kapal12345')).toBe(true);
    expect(meetsPasswordPolicy('1234567890')).toBe(false);
    expect(meetsPasswordPolicy('abcdefghij')).toBe(false);
    expect(meetsPasswordPolicy(`a1${'x'.repeat(127)}`)).toBe(false);
  });

  it('accepts letters and digits of any script', () => {
    expect(meetsPasswordPolicy('pelabuhanبحر٣٤')).toBe(true);
  });

  it('rates length and variety, never above weak when the policy fails', () => {
    expect(passwordStrength('').level).toBe('empty');
    expect(passwordStrength('abcdefghijklmnopqrstuvwxyz').level).toBe('weak');
    expect(passwordStrength('Kapal12345').level).toBe('fair');
    expect(passwordStrength('Kapal-Batam-2026').level).toBe('good');
    expect(passwordStrength('Selat Malaka pagi ini 2026!').level).toBe('strong');
  });
});

describe('sessions', () => {
  it('reads browser, system and device from user agents', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      ),
    ).toEqual({ browser: 'Chrome', os: 'Windows', device: 'desktop' });
    expect(
      parseUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ browser: 'Safari', os: 'iOS', device: 'mobile' });
    expect(
      parseUserAgent('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130.0'),
    ).toMatchObject({ os: 'Android', device: 'tablet' });
    expect(
      parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:132.0) Firefox/132.0'),
    ).toEqual({ browser: 'Firefox', os: 'macOS', device: 'desktop' });
    expect(parseUserAgent(null)).toEqual({ browser: null, os: null, device: 'unknown' });
  });

  it('puts the current session first, then the most recently used', () => {
    const sorted = sortSessions([
      { id: 'a', current: false, lastUsedAt: '2026-11-20T10:00:00Z' },
      { id: 'b', current: false, lastUsedAt: '2026-11-21T10:00:00Z' },
      { id: 'c', current: true, lastUsedAt: '2026-11-19T10:00:00Z' },
    ]);
    expect(sorted.map((s) => s.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('otpauth', () => {
  it('reads issuer, account and parameters', () => {
    expect(
      parseOtpauthUrl(
        'otpauth://totp/AIS%20Maritime%20Intelligence:rina%40pelni.test?secret=JBSWY3DPEHPK3PXP&issuer=AIS%20Maritime%20Intelligence&period=30&digits=6',
      ),
    ).toEqual({
      issuer: 'AIS Maritime Intelligence',
      account: 'rina@pelni.test',
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
    });
    expect(parseOtpauthUrl('otpauth://totp/rina?secret=ABC')).toMatchObject({
      issuer: null,
      account: 'rina',
    });
    expect(parseOtpauthUrl('https://example.com')).toBeNull();
    expect(parseOtpauthUrl('not a url')).toBeNull();
  });

  it('groups secrets and normalizes codes', () => {
    expect(formatSecret('jbswy3dpehpk3pxp')).toBe('JBSW Y3DP EHPK 3PXP');
    expect(normalizeOtp(' 12-34 567 ')).toBe('123456');
  });
});
