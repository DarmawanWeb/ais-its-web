import { describe, expect, it } from 'vitest';

import { attachmentFilename } from './download';

describe('attachmentFilename', () => {
  it('reads the quoted, plain and RFC 5987 forms', () => {
    expect(attachmentFilename('attachment; filename="a b.csv"', 'x.csv')).toBe('a b.csv');
    expect(attachmentFilename('attachment; filename=plain.csv', 'x.csv')).toBe('plain.csv');
    expect(attachmentFilename("attachment; filename*=UTF-8''kapal%20A.csv", 'x.csv')).toBe(
      'kapal A.csv',
    );
  });

  it('falls back without a usable header', () => {
    expect(attachmentFilename(undefined, 'x.csv')).toBe('x.csv');
    expect(attachmentFilename('inline', 'x.csv')).toBe('x.csv');
  });
});
