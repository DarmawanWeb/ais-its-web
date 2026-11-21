import { FC, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import NavstatusAnomalyCard from "./components/navstatus-anomaly-card";
import MapComponent from "../../components/common/map";
import { useFleetPositions } from "../../hooks/use-fleet-positions";

const AnomalyPage: FC = () => {
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const location = useLocation();
  // Loaded once, as before.
  const { ships: shipData } = useFleetPositions({ intervalMs: null });

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const mmsiParam = urlParams.get("mmsi");
    if (mmsiParam) {
      setSelectedMmsi(mmsiParam);
    }
  }, [location.search]);


  return (
    <main className="h-screen w-screen relative bg-gray-300 overflow-hidden z-1">
        <aside className="absolute top-0 right-0 z-100 w-[28%] h-full bg-slate-300 p-4 pr-20">
          <NavstatusAnomalyCard markers={shipData} />
      </aside>

      <MapComponent
        markers={shipData}
        selectedMmsi={selectedMmsi}
        setSelectedMmsi={setSelectedMmsi}
      />
    </main>
  );
};
export default AnomalyPage;