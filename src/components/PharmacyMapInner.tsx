"use client";

import { useEffect, useState } from "react";
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
import { MapPin, Navigation, Loader2, Package } from "lucide-react";

// Fix Leaflet default icon issue in Next.js
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const UserIcon = L.divIcon({
  html: `<div style="
    width: 20px;
    height: 20px;
    background: #34d399;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 12px rgba(52, 211, 153, 0.6), 0 0 24px rgba(52, 211, 153, 0.3);
  "></div>`,
  className: "",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -12],
});

const PharmacyIcon = L.divIcon({
  html: `<div style="
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #06b6d4, #10b981);
    border: 2px solid white;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(6, 182, 212, 0.4);
    font-size: 16px;
  ">💊</div>`,
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -18],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Mock generation removed in favor of real Overpass API data

// Component to recenter map when user location updates
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 15, { animate: true });
  }, [lat, lng, map]);
  return null;
}

function PharmacyMapInner() {
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);

  // Default center: RV University / Kengeri area
  const defaultCenter: [number, number] = [12.9225, 77.5005];

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      setLoadingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setLoadingLocation(false);
        
        try {
          // Fetch real data from Overpass API
          const response = await fetch(`/api/places?lat=${latitude}&lng=${longitude}&radius=3000`);
          if (!response.ok) throw new Error("Failed to fetch places");
          const data = await response.json();
          setPharmacies(data.facilities || []);
        } catch (err) {
          console.error(err);
          setLocationError("Could not load nearby facilities.");
        }
      },
      (error) => {
        console.warn("Geolocation error:", error.message);
        setLocationError(
          "Location access denied. Cannot find nearby facilities."
        );
        setLoadingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  const center: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : defaultCenter;

  return (
    <div className="relative">
      {/* Location Status */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {loadingLocation ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Getting your location...
          </div>
        ) : locationError ? (
          <div className="flex items-center gap-2 text-sm text-amber-400/80 bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-500/20">
            <Navigation className="w-4 h-4" />
            {locationError}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-emerald-400/80 bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/20">
            <Navigation className="w-4 h-4" />
            Location found — showing pharmacies within 1-2 km
          </div>
        )}

        {pharmacies.length > 0 && (
          <div className="text-xs text-slate-500">
            {pharmacies.length} pharmacies nearby
          </div>
        )}
      </div>

      {/* Map Container */}
      <div className="rounded-xl overflow-hidden border border-slate-700/50 shadow-2xl">
        <MapContainer
          center={center}
          zoom={15}
          scrollWheelZoom={true}
          style={{ height: "400px", width: "100%" }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {userLocation && (
            <RecenterMap lat={userLocation.lat} lng={userLocation.lng} />
          )}

          {/* User Location Marker */}
          {userLocation && (
            <Marker
              position={[userLocation.lat, userLocation.lng]}
              icon={UserIcon}
            >
              <Popup>
                <div className="text-center">
                  <strong className="text-emerald-600">📍 You are here</strong>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Pharmacy Markers */}
          {pharmacies.map((pharmacy) => (
            <Marker
              key={pharmacy.id}
              position={[pharmacy.lat, pharmacy.lng]}
              icon={PharmacyIcon}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <h3 className="font-bold text-base text-slate-800 mb-1">
                    💊 {pharmacy.name}
                  </h3>
                  <p className="text-xs text-slate-500 mb-3 flex items-center gap-1">
                    📍 {pharmacy.address}
                  </p>
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${pharmacy.lat},${pharmacy.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center w-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors"
                  >
                    Open in Google Maps
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Pharmacy List Below Map */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {pharmacies.map((pharmacy) => (
          <a
            key={pharmacy.id}
            href={`https://www.google.com/maps/search/?api=1&query=${pharmacy.lat},${pharmacy.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-cyan-500/50 hover:bg-slate-800 transition-all duration-300 group block"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 flex items-center justify-center border border-cyan-500/30 flex-shrink-0">
                <span className="text-lg">🏥</span>
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-white group-hover:text-cyan-400 transition-colors truncate">
                  {pharmacy.name}
                </h4>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{pharmacy.address}</span>
                </p>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default PharmacyMapInner;
