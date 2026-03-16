-- BusMaps integration schema updates

CREATE TABLE IF NOT EXISTS bus_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number text NOT NULL UNIQUE,
  route_name text,
  route_external_id text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'busmaps')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bus_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view bus catalog" ON bus_catalog;
CREATE POLICY "Anyone can view bus catalog"
  ON bus_catalog FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage bus catalog" ON bus_catalog;
CREATE POLICY "Admins can manage bus catalog"
  ON bus_catalog FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 5
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 5
    )
  );

ALTER TABLE stops ADD COLUMN IF NOT EXISTS busmaps_stop_id text;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS name_ru text;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS name_tj text;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS name_eng text;

CREATE UNIQUE INDEX IF NOT EXISTS stops_busmaps_stop_id_uidx ON stops(busmaps_stop_id)
WHERE busmaps_stop_id IS NOT NULL;

ALTER TABLE routes ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'busmaps'));
ALTER TABLE routes ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS routes_external_id_uidx ON routes(external_id)
WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bus_catalog_bus_number_idx ON bus_catalog(bus_number);

DROP TRIGGER IF EXISTS update_bus_catalog_updated_at ON bus_catalog;
CREATE TRIGGER update_bus_catalog_updated_at
  BEFORE UPDATE ON bus_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
