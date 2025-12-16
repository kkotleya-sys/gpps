/*
  # Bus Tracking Application Schema

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text)
      - `first_name` (text)
      - `last_name` (text)
      - `avatar_url` (text, nullable)
      - `role` (integer, default 1)
        - 0: Guest
        - 1: User
        - 2: Driver
        - 5: Admin
      - `bus_number` (text, nullable, for drivers)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `bus_locations`
      - `id` (uuid, primary key)
      - `driver_id` (uuid, references profiles)
      - `bus_number` (text)
      - `latitude` (double precision)
      - `longitude` (double precision)
      - `speed` (double precision, km/h)
      - `heading` (double precision, degrees)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Profiles: Users can read all profiles, update only their own
    - Bus locations: Everyone can read, only drivers can insert/update their own
    - Admin policies for admin role

  3. Extended tables for shared stops & schedules
    - `stops`
      - `id` (uuid, primary key)
      - `name` (text)
      - `latitude` (double precision)
      - `longitude` (double precision)
      - `created_at` (timestamptz)

    - `bus_stop_schedules`
      - `id` (uuid, primary key)
      - `bus_number` (text)
      - `stop_id` (uuid, references stops)
      - `driver_id` (uuid, references profiles)
      - `order_index` (integer, order of stop in route)
      - `arrival_time` (text, HH:MM, nullable)
      - `created_at` (timestamptz)
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  first_name text DEFAULT '',
  last_name text DEFAULT '',
  avatar_url text,
  role integer DEFAULT 1 CHECK (role IN (0, 1, 2, 5)),
  bus_number text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create bus_locations table
CREATE TABLE IF NOT EXISTS bus_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  bus_number text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  speed double precision DEFAULT 0,
  heading double precision DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_locations ENABLE ROW LEVEL SECURITY;

-- Create stops table
CREATE TABLE IF NOT EXISTS stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create bus_stop_schedules table
CREATE TABLE IF NOT EXISTS bus_stop_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number text NOT NULL,
  stop_id uuid NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  order_index integer NOT NULL DEFAULT 0,
  arrival_time text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_stop_schedules ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Anyone can view profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Admin can update any profile
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 5
    )
  );

-- Bus locations policies
CREATE POLICY "Anyone can view bus locations"
  ON bus_locations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Drivers can insert their location"
  ON bus_locations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 2
    )
  );

CREATE POLICY "Drivers can update their location"
  ON bus_locations FOR UPDATE
  TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Drivers can delete their location"
  ON bus_locations FOR DELETE
  TO authenticated
  USING (driver_id = auth.uid());

-- Stops policies
CREATE POLICY "Anyone can view stops"
  ON stops FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Drivers and admins can manage stops"
  ON stops FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN (2, 5)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN (2, 5)
    )
  );

-- Bus stop schedules policies
CREATE POLICY "Anyone can view bus stop schedules"
  ON bus_stop_schedules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Drivers can manage their own bus schedules"
  ON bus_stop_schedules FOR ALL
  TO authenticated
  USING (
    driver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 5
    )
  )
  WITH CHECK (
    driver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 5
    )
  );

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bus_locations_updated_at
  BEFORE UPDATE ON bus_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bus_stop_schedules_updated_at
  BEFORE UPDATE ON bus_stop_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS bus_locations_driver_id_idx ON bus_locations(driver_id);
CREATE INDEX IF NOT EXISTS bus_locations_updated_at_idx ON bus_locations(updated_at);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles(role);
CREATE INDEX IF NOT EXISTS stops_name_idx ON stops(name);
CREATE INDEX IF NOT EXISTS bus_stop_schedules_bus_idx ON bus_stop_schedules(bus_number);
CREATE INDEX IF NOT EXISTS bus_stop_schedules_stop_idx ON bus_stop_schedules(stop_id);
