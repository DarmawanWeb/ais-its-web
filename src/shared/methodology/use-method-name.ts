import { useAppLanguage } from '@/shared/i18n';

import { useMethodCatalog } from './catalog';

/** A service's own description of a method (`GET /<service>/methodology` → `methods[]`). */
export interface ServiceMethodName {
  id: string;
  name?: { id?: string; en?: string } | null;
}

/**
 * Name of a methodology id in the UI language: from the contracts catalog, else from a
 * service's own description of the methods it runs (`serviceMethods`, for ids the installed
 * catalog does not list yet), else the id itself.
 */
export function useMethodName(
  serviceMethods?: readonly ServiceMethodName[],
): (methodId: string) => string {
  const language = useAppLanguage();
  const catalog = useMethodCatalog().data;
  return (methodId) =>
    catalog?.getMethod(methodId)?.name[language] ??
    serviceMethods?.find((method) => method.id === methodId)?.name?.[language] ??
    methodId;
}
