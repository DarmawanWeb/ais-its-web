import { HttpResponse } from 'msw';

// An RFC 9457 problem details response for MSW handlers (spec §5), e.g.
//   http.get('*/api/v2/vessels', () => problemResponse(403, 'FORBIDDEN'))
export function problemResponse(
  status: number,
  code: string,
  title: string = code,
  extra: Record<string, unknown> = {},
) {
  return HttpResponse.json(
    { type: `urn:ais-its:problem:${code.toLowerCase()}`, title, status, code, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}
