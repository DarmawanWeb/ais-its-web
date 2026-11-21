import type { TFunction } from 'i18next';
import * as z from 'zod';

/** Password rule of spec §13.1: at least 10 characters with letters and digits. */
export function newPasswordSchema(t: TFunction) {
  return z
    .object({
      password: z
        .string()
        .min(10, t('auth:validation.passwordMin'))
        .refine(
          (value) => /[A-Za-z]/.test(value) && /\d/.test(value),
          t('auth:validation.passwordComplexity'),
        ),
      confirm: z.string(),
    })
    .refine((values) => values.password === values.confirm, {
      message: t('auth:validation.passwordMismatch'),
      path: ['confirm'],
    });
}

export function loginSchema(t: TFunction) {
  return z.object({
    email: z
      .string()
      .trim()
      .min(1, t('auth:validation.emailRequired'))
      .pipe(z.email(t('auth:validation.emailInvalid'))),
    password: z.string().min(1, t('auth:validation.passwordRequired')),
  });
}

export function emailSchema(t: TFunction) {
  return z.object({
    email: z
      .string()
      .trim()
      .min(1, t('auth:validation.emailRequired'))
      .pipe(z.email(t('auth:validation.emailInvalid'))),
  });
}

export function mfaSchema(t: TFunction) {
  return z.object({ code: z.string().regex(/^\d{6}$/, t('auth:validation.codeInvalid')) });
}
