-- Add routes table for named routes
CREATE TABLE IF NOT EXISTS routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number text NOT NULL,
  driver_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add route_stops table to link routes with stops and times
CREATE TABLE IF NOT EXISTS route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid REFERENCES routes(id) ON DELETE CASCADE,
  stop_id uuid REFERENCES stops(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  arrival_time text,
  created_at timestamptz DEFAULT now()
);

-- Add bus_profiles table for bus information
CREATE TABLE IF NOT EXISTS bus_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number text NOT NULL UNIQUE,
  driver_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add bus_media table for bus photos and videos
CREATE TABLE IF NOT EXISTS bus_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('photo', 'video')),
  media_url text NOT NULL,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Add reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number text NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Routes policies
CREATE POLICY "Anyone can view routes"
  ON routes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Drivers can manage their routes"
  ON routes FOR ALL
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

-- Route stops policies
CREATE POLICY "Anyone can view route stops"
  ON route_stops FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Drivers can manage route stops"
  ON route_stops FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = route_stops.route_id
      AND (routes.driver_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 5
      ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = route_stops.route_id
      AND (routes.driver_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 5
      ))
    )
  );

-- Bus profiles policies
CREATE POLICY "Anyone can view bus profiles"
  ON bus_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Drivers can manage their bus profile"
  ON bus_profiles FOR ALL
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

-- Bus media policies
CREATE POLICY "Anyone can view bus media"
  ON bus_media FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Drivers can manage their bus media"
  ON bus_media FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bus_profiles
      WHERE bus_profiles.bus_number = bus_media.bus_number
      AND (bus_profiles.driver_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 5
      ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bus_profiles
      WHERE bus_profiles.bus_number = bus_media.bus_number
      AND (bus_profiles.driver_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 5
      ))
    )
  );

-- Reviews policies
CREATE POLICY "Anyone can view reviews"
  ON reviews FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create reviews"
  ON reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN (1, 2, 5)
    )
  );

CREATE POLICY "Users can update their reviews"
  ON reviews FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their reviews"
  ON reviews FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create indexes
CREATE INDEX IF NOT EXISTS routes_bus_number_idx ON routes(bus_number);
CREATE INDEX IF NOT EXISTS routes_driver_id_idx ON routes(driver_id);
CREATE INDEX IF NOT EXISTS route_stops_route_id_idx ON route_stops(route_id);
CREATE INDEX IF NOT EXISTS route_stops_stop_id_idx ON route_stops(stop_id);
CREATE INDEX IF NOT EXISTS bus_profiles_bus_number_idx ON bus_profiles(bus_number);
CREATE INDEX IF NOT EXISTS bus_media_bus_number_idx ON bus_media(bus_number);
CREATE INDEX IF NOT EXISTS reviews_bus_number_idx ON reviews(bus_number);
CREATE INDEX IF NOT EXISTS reviews_user_id_idx ON reviews(user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_routes_updated_at
  BEFORE UPDATE ON routes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bus_profiles_updated_at
  BEFORE UPDATE ON bus_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure only one active route per bus
CREATE OR REPLACE FUNCTION ensure_single_active_route()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE routes
    SET is_active = false
    WHERE bus_number = NEW.bus_number
      AND id != NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_active_route_trigger
  BEFORE INSERT OR UPDATE ON routes
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_active_route();
