import { NextRequest } from "next/server";

type OverpassElement = {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

const OVERPASS_ENDPOINTS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const radiusParam = searchParams.get("radius") ?? "3000";
  const lat = Number(latParam);
  const lng = Number(lngParam);
  const radius = Number(radiusParam);

  if (
    !latParam?.trim() ||
    !lngParam?.trim() ||
    !radiusParam.trim() ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180 ||
    !Number.isInteger(radius) ||
    radius < 250 ||
    radius > 10000
  ) {
    return Response.json(
      { error: "Provide valid coordinates and a radius from 250 to 10000 meters." },
      { status: 400 }
    );
  }

  const query = [
    "[out:json][timeout:25];",
    "(",
    `node["amenity"~"^(pharmacy|hospital|clinic)$"](around:${radius},${lat},${lng});`,
    `way["amenity"~"^(pharmacy|hospital|clinic)$"](around:${radius},${lat},${lng});`,
    `relation["amenity"~"^(pharmacy|hospital|clinic)$"](around:${radius},${lat},${lng});`,
    ");",
    "out center;",
  ].join("");

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "CureRoute_CollegeProject/1.0 (Student_MVP_Testing)",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(18000),
        cache: "no-store",
      });

      if (!response.ok) {
        console.warn(`Overpass endpoint returned ${response.status}: ${endpoint}`);
        continue;
      }

      const data = (await response.json()) as OverpassResponse;
      if (!Array.isArray(data.elements)) {
        console.warn(`Overpass endpoint returned an invalid response: ${endpoint}`);
        continue;
      }

      const facilities = data.elements.flatMap((element) => {
        const facilityLat = element.lat ?? element.center?.lat;
        const facilityLng = element.lon ?? element.center?.lon;
        if (
          typeof facilityLat !== "number" ||
          typeof facilityLng !== "number" ||
          !Number.isFinite(facilityLat) ||
          !Number.isFinite(facilityLng)
        ) {
          return [];
        }

        const amenity = element.tags?.amenity || "medical";
        const street = element.tags?.["addr:street"];
        const city = element.tags?.["addr:city"];
        const address = [street, city].filter(Boolean).join(", ");

        return [{
          id: `${element.type}-${element.id}`,
          name: element.tags?.name || "Unnamed medical facility",
          lat: facilityLat,
          lng: facilityLng,
          amenity,
          address: address || `${amenity[0].toUpperCase()}${amenity.slice(1)}`,
          inStock: [],
        }];
      });

      return Response.json({ facilities });
    } catch (error) {
      console.warn(`Overpass request failed: ${endpoint}`, error);
    }
  }

  return Response.json(
    { error: "Nearby places are temporarily unavailable. Please try again later." },
    { status: 502 }
  );
}
