import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import MapComponent, {
  IAisPosition,
  MarkerData,
  ShipRoute,
} from "../../components/common/map";
import { VITE_BACKEND_URI } from "../../lib/env";
import IllegalTranshipmentCard, {
  IllegalTranshipmentResult,
} from "./components/illegal-transhipment-card";
import { useFleetPositions } from "../../hooks/use-fleet-positions";
import { FLEET_POLL_INTERVAL_MS } from "../../hooks/use-polling";

type RawRoutePosition = {
  navstatus: number;
  predictedNavStatus: number;
  ewsStatus: number;
  lat: number;
  lon: number;
  sog: number;
  cog: number;
  hdg: number;
  timestamp: string;
};

type RoutesApiResponse = {
  message: string;
  data: {
    ship1Positions: RawRoutePosition[];
    ship2Positions: RawRoutePosition[];
  };
  success: boolean;
};

const FLEET_PARAMS = { hours: 12 };

/** Timestamps as Date objects, for the map logic. */
const normalizeTimestamps = (ships: MarkerData[]): MarkerData[] =>
  ships.map((m) => ({
    ...m,
    positions: (m.positions ?? []).map((p) => ({
      ...p,
      timestamp: new Date(p.timestamp as unknown as string),
    })),
  }));

export default function IllegalTranshipmentPage() {
  const [selectedResult, setSelectedResult] =
    useState<IllegalTranshipmentResult | null>(null);
  const [routes, setRoutes] = useState<ShipRoute[] | null>(null);
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [routesLoaded, setRoutesLoaded] = useState(false);
  const routeAbortRef = useRef<AbortController | null>(null);
  const routeRequestIdRef = useRef(0);
  const routesCacheRef = useRef(
    new Map<string, { routes: ShipRoute[]; selectedMmsi: string; routesLoaded: boolean }>(),
  );

  // Map markers: refreshed every 10 s, each response replaces the list.
  const { ships: shipData } = useFleetPositions({
    intervalMs: FLEET_POLL_INTERVAL_MS,
    params: FLEET_PARAMS,
    normalize: normalizeTimestamps,
  });

  const abortRouteRequest = useCallback(() => {
    routeAbortRef.current?.abort();
    routeAbortRef.current = null;
  }, []);

  // Abort a pending route request when leaving the page.
  useEffect(() => abortRouteRequest, [abortRouteRequest]);

  const onClearRoutes = useCallback(() => {
    abortRouteRequest();
    setIsLoadingRoutes(false);
    setRoutes(null);
    setRoutesLoaded(false);
    setSelectedResult(null);
    setSelectedMmsi(null);
  }, [abortRouteRequest]);

  const toAisPosition = useCallback((p: RawRoutePosition): IAisPosition => {
    return {
      navstatus: p.navstatus,
      predictedNavStatus: p.predictedNavStatus,
      ewsStatus: p.ewsStatus,
      lat: p.lat,
      lon: p.lon,
      sog: p.sog,
      cog: p.cog,
      hdg: p.hdg,
      timestamp: new Date(p.timestamp),
    };
  }, []);

  const loadRoutesForResult = useCallback(async (result: IllegalTranshipmentResult) => {
    const requestId = ++routeRequestIdRef.current;
    abortRouteRequest();
    const controller = new AbortController();
    routeAbortRef.current = controller;

    setIsLoadingRoutes(true);
    setRoutesLoaded(false);

    try {
      const mmsi1 = result.ship1MMSI;
      const mmsi2 = result.ship2MMSI;
      const cacheKey =
        result._id && result.updatedAt
          ? `${result._id}-${String(result.updatedAt)}`
          : result._id || `${mmsi1}-${mmsi2}-${result.detectedAt}`;
      const cached = routesCacheRef.current.get(cacheKey);

      if (cached) {
        setRoutes(cached.routes);
        setSelectedMmsi(cached.selectedMmsi);
        setRoutesLoaded(cached.routesLoaded);
        setIsLoadingRoutes(false);
        return;
      }

      const detectedAt = new Date(result.detectedAt);

      const baseStart = result.startTimestamp
        ? new Date(result.startTimestamp)
        : new Date(detectedAt.getTime() - 30 * 60 * 1000);
      const baseEnd = result.endTimestamp
        ? new Date(result.endTimestamp)
        : new Date(detectedAt.getTime() + 30 * 60 * 1000);

      const sixHoursMs = 6 * 60 * 60 * 1000;
      const start = new Date(baseStart.getTime() - sixHoursMs);
      const end = new Date(Math.min(baseEnd.getTime() + sixHoursMs, Date.now()));

      const response = await axios.get<RoutesApiResponse>(
        `${VITE_BACKEND_URI}/ais/routes/${mmsi1}/${mmsi2}`,
        {
          params: {
            startTime: start.toISOString(),
            endTime: end.toISOString(),
          },
          signal: controller.signal,
        },
      );

      const ship1PositionsRaw = response.data?.data?.ship1Positions ?? [];
      const ship2PositionsRaw = response.data?.data?.ship2Positions ?? [];

      const ship1Positions = ship1PositionsRaw.map(toAisPosition);
      const ship2Positions = ship2PositionsRaw.map(toAisPosition);

      const nextRoutes: ShipRoute[] = [
        {
          mmsi: mmsi1,
          positions: ship1Positions,
          color: "#FF6B6B",
          illegalSegment:
            result.startTimestamp && result.endTimestamp
              ? {
                  start: new Date(result.startTimestamp),
                  end: new Date(result.endTimestamp),
                  color: "#FFD93D",
                }
              : undefined,
        },
        {
          mmsi: mmsi2,
          positions: ship2Positions,
          color: "#4ECDC4",
          illegalSegment:
            result.startTimestamp && result.endTimestamp
              ? {
                  start: new Date(result.startTimestamp),
                  end: new Date(result.endTimestamp),
                  color: "#FFD93D",
                }
              : undefined,
        },
      ];
      if (routeRequestIdRef.current !== requestId) return;
      setRoutes(nextRoutes);
      setSelectedMmsi(mmsi1);
      const nextRoutesLoaded = ship1Positions.length > 0 || ship2Positions.length > 0;
      setRoutesLoaded(nextRoutesLoaded);
      routesCacheRef.current.set(cacheKey, {
        routes: nextRoutes,
        selectedMmsi: mmsi1,
        routesLoaded: nextRoutesLoaded,
      });
    } catch (error) {
      if (routeRequestIdRef.current !== requestId) return;
      if (axios.isCancel(error) || (error as { code?: string }).code === "ERR_CANCELED") {
        return;
      }
      console.error("Error loading ship routes:", error);
      setRoutes(null);
      setRoutesLoaded(false);
    } finally {
      if (routeRequestIdRef.current === requestId) {
        setIsLoadingRoutes(false);
      }
    }
  }, [toAisPosition, abortRouteRequest]);

  const onSelectResult = useCallback(
    (result: IllegalTranshipmentResult) => {
      setSelectedResult(result);
      void loadRoutesForResult(result);
    },
    [loadRoutesForResult],
  );

  return (
    <main className="h-screen w-screen relative bg-gray-300 overflow-hidden z-1">
      <aside className="absolute top-0 right-0 z-999 w-[28%] h-full bg-slate-300 p-4 pr-20">
        <IllegalTranshipmentCard
          onSelectResult={onSelectResult}
          selectedResult={selectedResult}
          onClearRoutes={onClearRoutes}
          isLoadingRoutes={isLoadingRoutes}
          routesLoaded={routesLoaded}
        />
      </aside>

      <MapComponent
        markers={shipData}
        selectedMmsi={selectedMmsi}
        setSelectedMmsi={setSelectedMmsi}
        routes={routes}
        zoomToRoutes
        isBatamView
      />
    </main>
  );
}
