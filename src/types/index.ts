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

export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  created_at: string;
}

export interface BusStopSchedule {
  id: string;
  bus_number: string;
  stop_id: string;
  driver_id: string | null;
  order_index: number;
  arrival_time: string | null;
  created_at: string;
}

export interface Route {
  id: string;
  bus_number: string;
  driver_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RouteStop {
  id: string;
  route_id: string;
  stop_id: string;
  order_index: number;
  arrival_time: string | null;
  created_at: string;
}

export interface BusProfile {
  id: string;
  bus_number: string;
  driver_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusMedia {
  id: string;
  bus_number: string;
  media_type: 'photo' | 'video';
  media_url: string;
  order_index: number;
  created_at: string;
}

export interface Review {
  id: string;
  bus_number: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  user?: Profile;
}

export interface BusFeedback {
  id: string;
  bus_number: string;
  user_id: string;
  crowd_level: number | null;
  complaint: string | null;
  created_at: string;
  user?: Profile;
}
