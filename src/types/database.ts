// Custom types for the ambulance system

export type UserRole = 'ambulance' | 'hospital' | 'admin' | 'super_admin';
export type EmergencyStatus = 'inactive' | 'active' | 'responding';
export type RouteDirection = 'N_S' | 'S_N' | 'E_W' | 'W_E';
export type SignalStatus = 'normal' | 'prepare' | 'priority';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  organization_name: string | null;
  is_approved: boolean;
  ambulance_id: string | null;
  city: string;
  permissions: any;
  last_login: string | null;
  two_factor_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Ambulance {
  vehicle_health: any;
  id: string;
  driver_id: string;
  vehicle_number: string;
  current_lat: number;
  current_lng: number;
  heading: number;
  speed: number;
  emergency_status: EmergencyStatus;
  route_direction: RouteDirection | null;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_name: string | null;
  is_blocked: boolean;
  blocked_by: string | null;
  blocked_at: string | null;
  force_emergency_mode: boolean;
  trip_history: any[];
  last_updated: string;
  created_at: string;
  // Driver details (joined from profiles)
  driver_name?: string | null;
  driver_email?: string | null;
  care_type?: string | null;
  battery_percentage?: number | null;
  active_token_id?: string | null;
}

export interface TrafficSignal {
  id: string;
  signal_name: string;
  location_lat: number;
  location_lng: number;
  current_status: SignalStatus;
  direction_ns: string;
  direction_sn: string;
  direction_ew: string;
  direction_we: string;
  priority_direction: RouteDirection | null;
  activated_by: string | null;
  manual_override: boolean;
  override_status: string;
  override_duration_minutes: number;
  health_status: string;
  last_health_check: string;
  last_updated: string;
  created_at: string;
}

export interface SignalActivation {
  id: string;
  signal_id: string;
  ambulance_id: string;
  activation_type: string;
  distance_meters: number;
  activated_at: string;
}

export interface SystemControl {
  id: string;
  system_enabled: boolean;
  emergency_broadcast: string | null;
  broadcast_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface TrafficZone {
  id: string;
  zone_name: string;
  zone_bounds: any; // GeoJSON polygon
  is_locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
}

export interface GreenCorridor {
  id: string;
  corridor_name: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  route_coordinates: any; // Array of [lat, lng] points
  duration_minutes: number;
  is_active: boolean;
  activated_by: string | null;
  activated_at: string | null;
  created_at: string;
}

export interface HospitalCapacity {
  id: string;
  hospital_id: string;
  total_beds: number;
  occupied_beds: number;
  icu_beds: number;
  occupied_icu_beds: number;
  emergency_beds: number;
  occupied_emergency_beds: number;
  is_accepting_patients: boolean;
  last_updated: string;
  updated_by: string | null;
}

export interface SystemAnalytics {
  id: string;
  date: string;
  total_emergencies: number;
  avg_response_time_seconds: number;
  lives_saved_estimate: number;
  corridor_efficiency_percent: number;
  hospital_overload_rate: number;
  peak_emergency_zones: any[];
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_values: any;
  new_values: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Helper to calculate distance using Haversine formula
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// Calculate ETA based on distance and speed
export function calculateETA(distanceMeters: number, speedKmh: number): number {
  if (speedKmh <= 0) return 0;
  const speedMs = speedKmh * (1000 / 3600); // Convert km/h to m/s
  return distanceMeters / speedMs; // Time in seconds
}

export function formatETA(seconds: number): string {
  if (seconds <= 0) return 'Calculating...';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins < 1) return `${secs} sec`;
  return `${mins} min ${secs} sec`;
}

// Determine route direction based on heading
export function getRouteDirection(heading: number): RouteDirection {
  // Normalize heading to 0-360
  heading = ((heading % 360) + 360) % 360;
  
  if (heading >= 315 || heading < 45) return 'N_S'; // Moving North to South
  if (heading >= 45 && heading < 135) return 'E_W'; // Moving East to West
  if (heading >= 135 && heading < 225) return 'S_N'; // Moving South to North
  return 'W_E'; // Moving West to East
}
