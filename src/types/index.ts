export interface Pharmacy {
  id: number;
  name: string;
  lat: number;
  lng: number;
  address: string;
  inStock: string[];
}

export interface TriageResult {
  severity: "low" | "medium" | "high";
  remedy_suggestions: string;
  requires_doctor: boolean;
  isComplete?: boolean;
}
