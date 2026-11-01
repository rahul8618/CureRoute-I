import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radius = searchParams.get("radius") || "3000"; // Default to 3000m

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "Latitude (lat) and Longitude (lng) are required." },
      { status: 400 }
    );
  }

  // Construct Overpass QL query per user's exact specification
  const overpassQuery = `[out:json][timeout:25]; ( node["amenity"~"pharmacy|hospital|clinic"](around:${radius},${lat},${lng}); way["amenity"~"pharmacy|hospital|clinic"](around:${radius},${lat},${lng}); ); out center;`;

  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
  ];

  let data = null;
  let lastError = null;
  let lastStatus = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "User-Agent": "CureRoute_CollegeProject/1.0 (Student_MVP_Testing)",
        },
        body: `data=${encodeURIComponent(overpassQuery)}`,
      });

      if (response.ok) {
        data = await response.json();
        break; // Success! Exit the loop.
      } else {
        const errorText = await response.text();
        console.warn(`Overpass API error at ${endpoint}:`, response.status, errorText);
        lastError = errorText;
        lastStatus = response.status;
        // Continue to the next endpoint if it fails (e.g. 504 timeout/busy)
      }
    } catch (err: any) {
      console.warn(`Fetch error for ${endpoint}:`, err);
      lastError = err.message;
      lastStatus = 500;
    }
  }

  if (!data) {
    return NextResponse.json(
      { error: `All Overpass API endpoints failed. Last error: ${lastStatus} ${lastError}` },
      { status: lastStatus || 500 }
    );
  }

    // Map Overpass response to our app's location objects
    const facilities = data.elements.map((el: any) => {
      // For 'way' elements, Overpass returns 'center' object for coordinates
      const elLat = el.lat || (el.center && el.center.lat);
      const elLon = el.lon || (el.center && el.center.lon);
      
      // Some locations might lack a name tag
      const name = el.tags?.name || "Unknown Facility";
      const amenity = el.tags?.amenity || "medical";

      return {
        id: el.id,
        name: name,
        lat: elLat,
        lng: elLon,
        amenity: amenity,
        // We'll map amenity to a generic address-like label since Overpass 
        // doesn't always provide full structured addresses without extra geocoding
        address: `${amenity.charAt(0).toUpperCase() + amenity.slice(1)}`, 
        // We do not know real-time stock, so we leave it empty or provide generic
        inStock: []
      };
    }).filter((facility: any) => facility.lat && facility.lng);

    return NextResponse.json({ facilities });

}
