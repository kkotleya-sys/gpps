export enum UserRole {
  GUEST = 0,
  USER = 1,
  DRIVER = 2,
  ADMIN = 5,
}

export interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  role: UserRole;
  bus_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusLocation {
  id: string;
  driver_id: string;
  bus_number: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  updated_at: string;
}

export interface BusWithDriver extends BusLocation {
  driver?: Profile;
}
