import { createContext, useContext } from 'react';

import type { VesselLatestDto } from '@/shared/api/generated/ais-processor/model';
import type { FleetVesselCiiDto } from '@/shared/api/generated/emission/model';

/** Per-row data of the fleet list that arrives after the page (last seen, CII grade). */
export interface VesselTableData {
  lastSeen: ReadonlyMap<number, VesselLatestDto | null>;
  lastSeenPending: boolean;
  cii: ReadonlyMap<number, FleetVesselCiiDto>;
}

const EMPTY: VesselTableData = { lastSeen: new Map(), lastSeenPending: false, cii: new Map() };

/**
 * Context instead of column dependencies: TanStack renders cell functions as components, so the
 * column definitions must stay stable while these maps fill in (otherwise every cell remounts).
 */
export const VesselTableContext = createContext<VesselTableData>(EMPTY);

export function useVesselTableData(): VesselTableData {
  return useContext(VesselTableContext);
}
