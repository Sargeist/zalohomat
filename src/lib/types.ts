export type Status = 'ok' | 'issue' | 'down';
export type EffStatus = Status | 'unknown';

export interface Machine {
  id: string;
  name: string;
  chain: string | null;
  address: string | null;
  city: string | null;
  lat: number;
  lng: number;
  distance_m: number;
  opening_hours: string | null;
  accepts_pet: boolean;
  accepts_cans: boolean;
  type: 'auto' | 'big' | 'manual';
  source: string;
  status: Status | null;
  status_confidence: number;
  status_reports: number;
  status_at: string | null;
  open_now?: boolean | null;
  availability?: string | null;
}

export interface Report {
  id: number;
  machine_id: string;
  status: Status;
  reasons: string[];
  created_at: string;
}
