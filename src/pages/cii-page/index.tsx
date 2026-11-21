import { FC, useState, useEffect, useCallback } from "react";
import MapComponent from "../../components/common/map";
import { useNavigate, useLocation } from "react-router-dom";
import { Input } from "../../components/ui/input";
import CIISection from "./components/cii-section";
import { Search } from "lucide-react";
import ShipInfoCard from "./components/ship-info-card";
import { VITE_BACKEND_URI } from "../../lib/env";
import { MarkerData } from "../../components/common/map";
import { ShipData } from "./components/ship-info-card";
import { ICIICalculation } from "./cii-value-card";
import { useFleetPositions } from "../../hooks/use-fleet-positions";
import {
  DETAIL_POLL_INTERVAL_MS,
  FLEET_POLL_INTERVAL_MS,
} from "../../hooks/use-polling";
import { useVesselResource } from "../../hooks/use-vessel-resource";
import { useSafeTimeout } from "../../hooks/use-safe-timeout";

export type ciiGrafik = {
  ciiData: {
    ciiAttained: number;
    timestamp: string;
  }[];
  ddVector: {
    d1: number;
    d2: number;
    d3: number;
    d4: number;
  };
} | null;

type LatestDailyCii = { cii?: { cii: ICIICalculation }[] };

const FLEET_PARAMS = { hours: 12 };

const CIIPage: FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredShips, setFilteredShips] = useState<MarkerData[]>([]);
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const [showCiiSection, setShowCiiSection] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const schedule = useSafeTimeout();

  // Map markers: refreshed every 10 s, each response replaces the list.
  const { ships: shipData } = useFleetPositions({
    intervalMs: FLEET_POLL_INTERVAL_MS,
    params: FLEET_PARAMS,
  });

  // Detail panels of the selected vessel: refreshed every 5 s.
  const shipDetail = useVesselResource(
    selectedMmsi,
    (mmsi) => `${VITE_BACKEND_URI}/ships/data/secondary/mmsi/${mmsi}`,
    (body) => (body.data ?? null) as ShipData | null,
    DETAIL_POLL_INTERVAL_MS
  );
  // 404 CII_NOT_AVAILABLE: no CII computed for this vessel yet.
  const ciiLatest = useVesselResource(
    selectedMmsi,
    (mmsi) => `${VITE_BACKEND_URI}/cii/daily/${mmsi}/latest`,
    (body) => (body.data as LatestDailyCii | undefined)?.cii?.[0]?.cii ?? null,
    DETAIL_POLL_INTERVAL_MS
  );
  const ciiAttained = useVesselResource(
    selectedMmsi,
    (mmsi) => `${VITE_BACKEND_URI}/cii/daily/${mmsi}/attained`,
    (body) => (body.data ?? null) as ciiGrafik,
    DETAIL_POLL_INTERVAL_MS
  );
  const ciiUnavailableMessage =
    ciiLatest.notFoundMessage ?? ciiAttained.notFoundMessage;

  const performSearch = useCallback((query: string, ships: MarkerData[]) => {
    if (query.trim() === "") {
      return [];
    }

    const searchTerm = query.trim();
    const filtered = ships.filter((ship) => {
      if (ship.mmsi === searchTerm) {
        return true;
      }
      return ship.mmsi.startsWith(searchTerm);
    });
    
    filtered.sort((a, b) => {
      if (a.mmsi === searchTerm) return -1;
      if (b.mmsi === searchTerm) return 1;
      return a.mmsi.localeCompare(b.mmsi);
    });

    return filtered;
  }, []);

  // Update filtered ships when ship data changes, but only if searching
  useEffect(() => {
    if (isSearchActive && searchQuery.trim() !== "") {
      const filtered = performSearch(searchQuery, shipData);
      setFilteredShips(filtered);
    } else if (!isSearchActive) {
      setFilteredShips([]);
    }
  }, [shipData, isSearchActive, searchQuery, performSearch]);

  // Handle URL params for selected MMSI
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const mmsiParam = urlParams.get("mmsi");
    if (mmsiParam) {
      setSelectedMmsi(mmsiParam);
    }
  }, [location.search]);

  useEffect(() => {
    if (selectedMmsi) setShowCiiSection(false);
  }, [selectedMmsi]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setIsSearchActive(query.trim() !== "");
    
    if (query.trim() === "") {
      setFilteredShips([]);
    } else {
      const filtered = performSearch(query, shipData);
      setFilteredShips(filtered);
    }
  };

  const handleShipClick = (mmsi: string) => {
    navigate(`?mmsi=${mmsi}`);
    setSearchQuery("");
    setFilteredShips([]);
    setIsSearchActive(false);
  };

  const handleInputBlur = () => {
    schedule(() => {
      setFilteredShips([]);
      setIsSearchActive(false);
    }, 200);
  };

  const handleInputFocus = () => {
    if (searchQuery.trim()) {
      setIsSearchActive(true);
      handleSearch(searchQuery);
    }
  };

  const toggleCiiSection = () => {
    setShowCiiSection(!showCiiSection);
  };

  return (
    <main className="h-screen w-screen relative bg-gray-300 overflow-hidden z-0">
      <aside className="absolute top-0 right-0 z-100 w-[28%] h-full bg-slate-300 p-4">
        <div className="mb-4 mr-16 relative">
          <Input
            placeholder="Search ships by MMSI..."
            className="w-full p-3 rounded-lg border border-gray-400 bg-white pl-10"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onBlur={handleInputBlur}
            onFocus={handleInputFocus}
          />
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
            <Search className="text-gray-600" size={20} />
          </div>
          {searchQuery.trim() && filteredShips.length > 0 && (
            <div className="mt-2 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto absolute z-999 w-full">
              {filteredShips.map((ship) => (
                <div
                  key={ship.mmsi}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 cursor-pointer border-b border-gray-100 last:border-b-0"
                  onClick={() => handleShipClick(ship.mmsi)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="font-medium">{ship.mmsi}</div>
                </div>
              ))}
            </div>
          )}
          {searchQuery.trim() && filteredShips.length === 0 && (
            <div className="mt-2 bg-white border rounded-lg shadow-lg text-sm p-3 absolute z-999 w-full">
              <div className="text-gray-500">No ships found matching "{searchQuery}"</div>
            </div>
          )}
        </div>
        <div className="mr-16 h-[90vh] ">
          <ShipInfoCard
            shipData={shipDetail.data}
            toogleCiiSection={toggleCiiSection}
            showCiiSection={showCiiSection}
          />
        </div>
      </aside>
      <CIISection
        ciiGrafik={ciiAttained.data}
        ciiData={ciiLatest.data}
        unavailableMessage={ciiUnavailableMessage}
        show={showCiiSection}
      />

      <MapComponent
        markers={shipData}
        selectedMmsi={selectedMmsi}
        setSelectedMmsi={setSelectedMmsi}
      />
    </main>
  );
};

export default CIIPage;