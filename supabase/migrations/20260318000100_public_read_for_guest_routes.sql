DROP POLICY IF EXISTS "Anyone can view stops" ON stops;
CREATE POLICY "Anyone can view stops"
  ON stops FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Anyone can view bus stop schedules" ON bus_stop_schedules;
CREATE POLICY "Anyone can view bus stop schedules"
  ON bus_stop_schedules FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Anyone can view routes" ON routes;
CREATE POLICY "Anyone can view routes"
  ON routes FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Anyone can view route stops" ON route_stops;
CREATE POLICY "Anyone can view route stops"
  ON route_stops FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Anyone can view bus profiles" ON bus_profiles;
CREATE POLICY "Anyone can view bus profiles"
  ON bus_profiles FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Anyone can view bus media" ON bus_media;
CREATE POLICY "Anyone can view bus media"
  ON bus_media FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Anyone can view reviews" ON reviews;
CREATE POLICY "Anyone can view reviews"
  ON reviews FOR SELECT
  TO public
  USING (true);
