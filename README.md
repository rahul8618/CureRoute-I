# CureRoute

CureRoute provides general health information and a map of nearby pharmacies. It does not analyze symptoms, diagnose conditions, or recommend treatment. No AI service or API key is required.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create a production build with `npm run build` and serve it with `npm start`.

## Features and requirements

- Type notes into the symptom field and submit to see the app's medical-safety guidance. The notes are not sent to a server or evaluated.
- Voice input uses the browser's built-in Speech Recognition API when available. Microphone access requires permission and a secure context (HTTPS or localhost); unsupported browsers can use the text field.
- The map uses OpenStreetMap tiles and nearby pharmacy/clinic/hospital data from the public Overpass API. An approximate default map location is shown if location access is unavailable. Geolocation requires permission and a secure context.
- Public map search services can be temporarily unavailable; the map provides a retry action and a direct Google Maps search fallback.
- Internet access is required for map tiles and nearby-place search.
