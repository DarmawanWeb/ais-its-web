/**
 * Password rules of the auth service (spec §13.1): at least 10 characters with a letter and a
 * digit, at most 128 characters, any script. The form checks them before the request so the
 * user sees the rules met while typing; the server stays the authority (400 VALIDATION_FAILED).
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordRule = 'length' | 'letter' | 'digit' | 'maxLength';

export const PASSWORD_RULES: readonly PasswordRule[] = ['length', 'letter', 'digit', 'maxLength'];

const LETTER = /\p{L}/u;
const DIGIT = /\p{Nd}/u;

/** Which rules a password meets. */
export function checkPasswordRules(password: string): Record<PasswordRule, boolean> {
  const length = [...password].length;
  return {
    length: length >= PASSWORD_MIN_LENGTH,
    letter: LETTER.test(password),
    digit: DIGIT.test(password),
    maxLength: length <= PASSWORD_MAX_LENGTH,
  };
}

export function meetsPasswordPolicy(password: string): boolean {
  return Object.values(checkPasswordRules(password)).every(Boolean);
}

export type PasswordStrength = 'empty' | 'weak' | 'fair' | 'good' | 'strong';

/**
 * A rough strength estimate for the meter (length and character variety; no dictionary): it
 * nudges towards long passphrases and never replaces the policy above.
 */
export function passwordStrength(password: string): { level: PasswordStrength; score: number } {
  if (password.length === 0) return { level: 'empty', score: 0 };
  const length = [...password].length;
  const classes = [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u].filter((re) =>
    re.test(password),
  ).length;
  let score = 0;
  if (length >= PASSWORD_MIN_LENGTH) score += 1;
  if (length >= 14) score += 1;
  if (length >= 20) score += 1;
  if (classes >= 3) score += 1;
  if (!meetsPasswordPolicy(password)) score = Math.min(score, 1);
  const level: PasswordStrength =
    score <= 1 ? 'weak' : score === 2 ? 'fair' : score === 3 ? 'good' : 'strong';
  return { level, score };
}
