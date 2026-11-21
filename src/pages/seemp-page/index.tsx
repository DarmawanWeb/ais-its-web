import { FC, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Input } from "../../components/ui/input";
import { Search } from "lucide-react";
import ShipInfoCard from "./components/ship-info-card";
import { VITE_BACKEND_URI } from "../../lib/env";
import { MarkerData } from "../../components/common/map";
import MapComponent from "../../components/common/map";
import { AnnualCIIWithDDVector } from "./components/cii-value-card";
import CiiValueCard from "./components/cii-value-card";
import SEEMPChart from "./components/seemp-chart";
import SeempTable from "./components/seemp-table";
import DataNotFound from "../../components/common/data-not-found";
import { ISeempTableProps } from "./components/seemp-table";
import { Seemp } from "../../types/seemp";
import { useFleetPositions } from "../../hooks/use-fleet-positions";
import { FLEET_POLL_INTERVAL_MS } from "../../hooks/use-polling";
import { useVesselResource } from "../../hooks/use-vessel-resource";
import { useSafeTimeout } from "../../hooks/use-safe-timeout";

import { ShipData } from "./components/ship-info-card";

const FLEET_PARAMS = { hours: 12 };

const SEEMPPage: FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredShips, setFilteredShips] = useState<MarkerData[]>([]);
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const location = useLocation();
  const schedule = useSafeTimeout();

  // Map markers: refreshed every 10 s, each response replaces the list.
  const { ships: shipData } = useFleetPositions({
    intervalMs: FLEET_POLL_INTERVAL_MS,
    params: FLEET_PARAMS,
  });

  // Loaded once per selected vessel, as before.
  const shipDetail = useVesselResource(
    selectedMmsi,
    (mmsi) => `${VITE_BACKEND_URI}/ships/data/secondary/mmsi/${mmsi}`,
    (body) => (body.data ?? null) as ShipData | null,
    null
  ).data;
  // 404: no annual CII for this vessel.
  const annualCii = useVesselResource(
    selectedMmsi,
    (mmsi) => `${VITE_BACKEND_URI}/cii/annual/${mmsi}/ddvector`,
    (body) => (body.data ?? []) as AnnualCIIWithDDVector[],
    null
  );
  const ciiData = annualCii.data ?? [];
  // 404 CII_NOT_AVAILABLE: SEEMP needs a computed CII.
  const seemp = useVesselResource(
    selectedMmsi,
    (mmsi) => `${VITE_BACKEND_URI}/seemp/${mmsi}`,
    (body) => body as unknown as ISeempTableProps,
    null
  );
  const seempData = seemp.data;

  const [itemsPerPage] = useState(5);
  const [currentItems, setCurrentItems] = useState<Seemp[] | null>(null);
  const navigate = useNavigate();

  const toggleTableVisibility = () => {
    setShowTable((prev) => !prev);
  };

  useEffect(() => {
    setFilteredShips(shipData);
  }, [shipData]);

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const mmsiParam = urlParams.get("mmsi");
    const pageParam = urlParams.get("page");

    if (mmsiParam) {
      setSelectedMmsi(mmsiParam);
    }

    const pageNumber = pageParam ? Number(pageParam) : 1;

    const indexOfLastItem = pageNumber * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;

    if (seempData?.data) {
      const paginatedData = seempData.data.slice(
        indexOfFirstItem,
        indexOfLastItem
      );
      setCurrentItems(paginatedData);
    } else {
      setCurrentItems(null);
    }

    window.scrollTo(0, 0);
  }, [location.search, itemsPerPage, seempData?.data]);

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const mmsiParam = urlParams.get("mmsi");
    if (mmsiParam) {
      setSelectedMmsi(mmsiParam);
    }
  }, [location.search]);

  // Fixed search function
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim() === "") {
      setFilteredShips([]);
    } else {
      const searchTerm = query.trim();
      const filtered = shipData.filter((ship) => {
        // Exact match first priority
        if (ship.mmsi === searchTerm) {
          return true;
        }
        // Then starts with match
        return ship.mmsi.startsWith(searchTerm);
      });
      
      // Sort results: exact match first, then by MMSI order
      filtered.sort((a, b) => {
        if (a.mmsi === searchTerm) return -1;
        if (b.mmsi === searchTerm) return 1;
        return a.mmsi.localeCompare(b.mmsi);
      });
      
      setFilteredShips(filtered);
    }
  };

  const handleShipClick = (mmsi: string) => {
    navigate(`?mmsi=${mmsi}`);
    setSearchQuery("");
    setFilteredShips([]);
  };

  const handleInputBlur = () => {
    schedule(() => {
      setFilteredShips([]);
    }, 200);
  };

  const totalPages =
    seempData?.data && seempData.data.length
      ? Math.ceil(seempData.data.length / itemsPerPage)
      : 1;


  return (
    <main className="h-screen w-screen relative bg-gray-300 overflow-hidden z-1">
      <aside className="absolute top-0 right-0 z-100 w-7/20 h-full bg-slate-300 p-3 rounded-l-xl">
        <div className="mb-2 mr-16 relative mt-2">
          <Input
            placeholder="Search ships by MMSI..."
            className="w-full p-1 rounded-md border border-gray-400 bg-white pl-8 text-xs"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onBlur={handleInputBlur}
            onFocus={() => {
              // Show results again if there's a search query
              if (searchQuery.trim()) {
                handleSearch(searchQuery);
              }
            }}
          />
          <div className="absolute left-2 top-1/2 transform -translate-y-1/2">
            <Search className="text-gray-600" size={16} />
          </div>
          {searchQuery.trim() && filteredShips.length > 0 && (
            <div className="mt-2 bg-white border rounded-md shadow-lg text-sm max-h-40 overflow-y-auto absolute z-999 w-full">
              {filteredShips.map((ship) => (
                <div
                  key={ship.mmsi}
                  className="block px-3 py-1 hover:bg-gray-200 cursor-pointer border-b border-gray-100 last:border-b-0"
                  onClick={() => handleShipClick(ship.mmsi)}
                  onMouseDown={(e) => e.preventDefault()} 
                >
                  <div className="font-medium">{ship.mmsi}</div>
                </div>
              ))}
            </div>
          )}
          {searchQuery.trim() && filteredShips.length === 0 && (
            <div className="mt-2 bg-white border rounded-md shadow-lg text-sm p-3 absolute z-999 w-full">
              <div className="text-gray-500">No ships found matching "{searchQuery}"</div>
            </div>
          )}
        </div>

        <div className="grid grid-rows-9 gap-4 mb-4 mr-16 h-[90vh]">
          <ShipInfoCard shipData={shipDetail} />
          <div className="grid grid-cols-2 gap-2 row-span-4">
            <CiiValueCard
              ciis={ciiData}
              unavailableMessage={annualCii.notFoundMessage}
            />
            <SEEMPChart
              ciis={ciiData}
              showTable={showTable}
              toggleTableVisibility={toggleTableVisibility}
              unavailableMessage={annualCii.notFoundMessage}
            />
          </div>
        </div>
      </aside>

      <MapComponent
        markers={shipData}
        selectedMmsi={selectedMmsi}
        setSelectedMmsi={setSelectedMmsi}
      />
      {showTable && (
        <section className="h-64 absolute bottom-0 w-13/20 z-100 left-0 bg-slate-300 p-3 text-xs pl-5">
          {seemp.notFoundMessage ? (
            <DataNotFound message={seemp.notFoundMessage} />
          ) : (
            <SeempTable data={currentItems} pageCount={totalPages} />
          )}
        </section>
      )}
    </main>
  );
};

export default SEEMPPage;