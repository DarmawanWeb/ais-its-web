import { http } from './http';

/** File name of a `Content-Disposition: attachment; filename="…"` header, else `fallback`. */
export function attachmentFilename(header: unknown, fallback: string): string {
  if (typeof header !== 'string') return fallback;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim());
    } catch {
      // fall through to the plain parameter
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)?.[1]?.trim();
  return plain || fallback;
}

/** Saves text as a file through a temporary object URL (CSV exports, GeoJSON…). */
export function saveTextFile(
  filename: string,
  text: string,
  type = 'text/csv;charset=utf-8',
): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export interface ServerFile {
  /** Body as text (CSV, GeoJSON…). */
  text: string;
  /** Name from `Content-Disposition`, else the fallback. */
  filename: string;
  /** Response headers (lower-case names), e.g. `x-truncated`. */
  headers: Record<string, string>;
}

/**
 * Fetches a file a service streams (e.g. `GET /telemetry/vessels/:mmsi/readings.csv`) through
 * the shared axios instance — bearer token, refresh-on-401 and `ApiProblem` errors included.
 */
export async function fetchServerFile(
  url: string,
  params: Record<string, unknown> | undefined,
  fallbackName: string,
  { accept = 'text/csv', headers = {} }: { accept?: string; headers?: Record<string, string> } = {},
): Promise<ServerFile> {
  const response = await http.get<string>(url, {
    params,
    headers: { Accept: accept, ...headers },
    responseType: 'text',
    // Keep the body as the service sent it (no JSON parsing of a CSV that looks like a number).
    transformResponse: (data: unknown) => data,
  });
  const text = typeof response.data === 'string' ? response.data : String(response.data ?? '');
  const responseHeaders: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers ?? {})) {
    if (typeof value === 'string') responseHeaders[name.toLowerCase()] = value;
  }
  return {
    text,
    filename: attachmentFilename(responseHeaders['content-disposition'], fallbackName),
    headers: responseHeaders,
  };
}

/**
 * Downloads a file a service streams and saves it under the server's `Content-Disposition`
 * name (else `fallbackName`).
 *
 *   await downloadServerFile('/api/v2/audit-logs.csv', { orgId }, 'audit-log.csv');
 */
export async function downloadServerFile(
  url: string,
  params: Record<string, unknown> | undefined,
  fallbackName: string,
  options: { accept?: string; headers?: Record<string, string> } = {},
): Promise<ServerFile> {
  const file = await fetchServerFile(url, params, fallbackName, options);
  saveTextFile(file.filename, file.text, `${options.accept ?? 'text/csv'};charset=utf-8`);
  return file;
}
