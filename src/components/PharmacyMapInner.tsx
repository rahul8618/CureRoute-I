"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Pharmacy } from "@/types";
import { LocateFixed, Loader2, MapPin, Navigation } from "lucide-react";

const DEFAULT_CENTER: [number, number] = [12.9225, 77.5005];

const UserIcon = L.divIcon({
  html: `<div style="width:20px;height:20px;background:#34d399;border:3px solid white;border-radius:50%;box-shadow:0 0 12px rgba(52,211,153,.6)"></div>`,
  className: "",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const PharmacyIcon = L.divIcon({
  html: `<div style="width:32px;height:32px;background:linear-gradient(135deg,#06b6d4,#10b981);border:2px solid white;border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(6,182,212,.4);font-size:16px">+</div>`,
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lng], 15, { animate: true });
  }, [lat, lng, map]);

  return null;
}

function PharmacyMapInner() {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [locationStatus, setLocationStatus] = useState<
    "loading" | "located" | "fallback"
  >("fallback");
  const [locationAttempt, setLocationAttempt] = useState(0);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loadingFacilities, setLoadingFacilities] = useState(true);
  const [facilityError, setFacilityError] = useState<string | null>(null);
  const [facilityRetry, setFacilityRetry] = useState(0);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: [number, number] = [
          position.coords.latitude,
          position.coords.longitude,
        ];
        setUserLocation(location);
        setMapCenter(location);
        setLocationStatus("located");
      },
      () => {
        setUserLocation(null);
        setMapCenter(DEFAULT_CENTER);
        setLocationStatus("fallback");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, [locationAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    const [lat, lng] = mapCenter;

    const loadFacilities = async () => {
      setLoadingFacilities(true);
      setFacilityError(null);
      setPharmacies([]);
      try {
        const response = await fetch(
          `/api/places?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=5000`,
          { signal: controller.signal }
        );
        const data = (await response.json()) as {
          facilities?: Pharmacy[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || "Could not load nearby places.");
        }
        if (!Array.isArray(data.facilities)) {
          throw new Error("The nearby places service returned invalid data.");
        }
        setPharmacies(data.facilities);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Could not load nearby places:", error);
        setPharmacies([]);
        setFacilityError(
          error instanceof Error ? error.message : "Could not load nearby places."
        );
      } finally {
        if (!controller.signal.aborted) setLoadingFacilities(false);
      }
    };

    void loadFacilities();
    return () => controller.abort();
  }, [facilityRetry, mapCenter]);

  const retryLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus("fallback");
      return;
    }
    setLocationStatus("loading");
    setLocationAttempt((attempt) => attempt + 1);
  }, []);

  return (
    <div className="relative">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          {locationStatus === "loading" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Getting your location...
            </>
          ) : locationStatus === "located" ? (
            <>
              <Navigation className="w-4 h-4 text-emerald-400" />
              Showing facilities near your location
            </>
          ) : (
            <>
              <Navigation className="w-4 h-4 text-amber-400" />
              Showing facilities near RV University, Kengeri
            </>
          )}
        </div>
        <button
          type="button"
          onClick={retryLocation}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-300"
        >
          <LocateFixed className="h-4 w-4" />
          Use my location
        </button>
      </div>

      <div className="mb-3 min-h-5 text-xs text-slate-500" aria-live="polite">
        {loadingFacilities
          ? "Searching for nearby pharmacies and medical facilities..."
          : facilityError
            ? facilityError
            : pharmacies.length > 0
              ? `${pharmacies.length} pharmacies and medical facilities nearby`
              : "No nearby pharmacies or medical facilities were found in this area."}
      </div>

      {facilityError && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setFacilityRetry((attempt) => attempt + 1)}
            className="rounded-lg border border-slate-700 px-3 py-2 text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-300"
          >
            Retry nearby search
          </button>
          <a
            href={`https://www.google.com/maps/search/pharmacy/@${mapCenter[0]},${mapCenter[1]},14z`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
          >
            Search pharmacies in Google Maps
          </a>
        </div>
      )}

      <div className="rounded-xl overflow-hidden border border-slate-700/50 shadow-2xl">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={14}
          scrollWheelZoom
          style={{ height: "400px", width: "100%" }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <RecenterMap lat={mapCenter[0]} lng={mapCenter[1]} />
          {userLocation && (
            <Marker position={userLocation} icon={UserIcon}>
              <Popup>You are here</Popup>
            </Marker>
          )}

          {pharmacies.map((pharmacy) => (
            <Marker
              key={pharmacy.id}
              position={[pharmacy.lat, pharmacy.lng]}
              icon={PharmacyIcon}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <h3 className="mb-1 text-base font-bold text-slate-800">
                    {pharmacy.name}
                  </h3>
                  <p className="mb-3 text-xs text-slate-500">
                    {pharmacy.address}
                  </p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${pharmacy.lat},${pharmacy.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg bg-emerald-500 py-1.5 text-center text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
                  >
                    Open directions
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {pharmacies.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pharmacies.map((pharmacy) => (
            <a
              key={pharmacy.id}
              href={`https://www.google.com/maps/search/?api=1&query=${pharmacy.lat},${pharmacy.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 transition-all duration-300 hover:border-cyan-500/50 hover:bg-slate-800"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-gradient-to-br from-cyan-500/20 to-emerald-500/20">
                  <MapPin className="h-5 w-5 text-cyan-400" />
                </div>
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-semibold text-white transition-colors group-hover:text-cyan-400">
                    {pharmacy.name}
                  </h4>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {pharmacy.address}
                  </p>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default PharmacyMapInner;
