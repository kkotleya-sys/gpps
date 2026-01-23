-- ============================================
-- ПОЛНАЯ МИГРАЦИЯ ДЛЯ ВСЕХ ТАБЛИЦ
-- Скопируйте и выполните этот код в Supabase SQL Editor
-- ============================================

-- 1. Создание всех таблиц
CREATE TABLE IF NOT EXISTS stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bus_stop_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number text NOT NULL,
  stop_id uuid NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  order_index integer NOT NULL DEFAULT 0,
  arrival_time text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number text NOT NULL,
  driver_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid REFERENCES routes(id) ON DELETE CASCADE,
  stop_id uuid REFERENCES stops(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  arrival_time text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bus_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number text NOT NULL UNIQUE,
  driver_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bus_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('photo', 'video')),
  media_url text NOT NULL,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number text NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Включение RLS
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_stop_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- 3. Удаление старых политик (если есть)
DROP POLICY IF EXISTS "Anyone can view stops" ON stops;
DROP POLICY IF EXISTS "Drivers and admins can manage stops" ON stops;
DROP POLICY IF EXISTS "Anyone can view bus stop schedules" ON bus_stop_schedules;
DROP POLICY IF EXISTS "Drivers can manage their own bus schedules" ON bus_stop_schedules;
DROP POLICY IF EXISTS "Anyone can view routes" ON routes;
DROP POLICY IF EXISTS "Drivers can manage their routes" ON routes;
DROP POLICY IF EXISTS "Anyone can view route stops" ON route_stops;
DROP POLICY IF EXISTS "Drivers can manage route stops" ON route_stops;
DROP POLICY IF EXISTS "Anyone can view bus profiles" ON bus_profiles;
DROP POLICY IF EXISTS "Drivers can manage their bus profile" ON bus_profiles;
DROP POLICY IF EXISTS "Anyone can view bus media" ON bus_media;
DROP POLICY IF EXISTS "Drivers can manage their bus media" ON bus_media;
DROP POLICY IF EXISTS "Anyone can view reviews" ON reviews;
DROP POLICY IF EXISTS "Users can create reviews" ON reviews;
DROP POLICY IF EXISTS "Users can update their reviews" ON reviews;
DROP POLICY IF EXISTS "Users can delete their reviews" ON reviews;

-- 4. Создание политик
CREATE POLICY "Anyone can view stops" ON stops FOR SELECT TO authenticated USING (true);
CREATE POLICY "Drivers and admins can manage stops" ON stops FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (2, 5)))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (2, 5)));

CREATE POLICY "Anyone can view bus stop schedules" ON bus_stop_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Drivers can manage their own bus schedules" ON bus_stop_schedules FOR ALL TO authenticated
  USING (driver_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 5))
  WITH CHECK (driver_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 5));

CREATE POLICY "Anyone can view routes" ON routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Drivers can manage their routes" ON routes FOR ALL TO authenticated
  USING (driver_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 5))
  WITH CHECK (driver_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 5));

CREATE POLICY "Anyone can view route stops" ON route_stops FOR SELECT TO authenticated USING (true);
CREATE POLICY "Drivers can manage route stops" ON route_stops FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM routes WHERE routes.id = route_stops.route_id AND (routes.driver_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 5))))
  WITH CHECK (EXISTS (SELECT 1 FROM routes WHERE routes.id = route_stops.route_id AND (routes.driver_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 5))));

CREATE POLICY "Anyone can view bus profiles" ON bus_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Drivers can manage their bus profile" ON bus_profiles FOR ALL TO authenticated
  USING (driver_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 5))
  WITH CHECK (driver_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 5));

CREATE POLICY "Anyone can view bus media" ON bus_media FOR SELECT TO authenticated USING (true);
CREATE POLICY "Drivers can manage their bus media" ON bus_media FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM bus_profiles WHERE bus_profiles.bus_number = bus_media.bus_number AND (bus_profiles.driver_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 5))))
  WITH CHECK (EXISTS (SELECT 1 FROM bus_profiles WHERE bus_profiles.bus_number = bus_media.bus_number AND (bus_profiles.driver_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 5))));

CREATE POLICY "Anyone can view reviews" ON reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create reviews" ON reviews FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (1, 2, 5)));
CREATE POLICY "Users can update their reviews" ON reviews FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete their reviews" ON reviews FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 5. Создание индексов
CREATE INDEX IF NOT EXISTS stops_name_idx ON stops(name);
CREATE INDEX IF NOT EXISTS bus_stop_schedules_bus_idx ON bus_stop_schedules(bus_number);
CREATE INDEX IF NOT EXISTS bus_stop_schedules_stop_idx ON bus_stop_schedules(stop_id);
CREATE INDEX IF NOT EXISTS routes_bus_number_idx ON routes(bus_number);
CREATE INDEX IF NOT EXISTS routes_driver_id_idx ON routes(driver_id);
CREATE INDEX IF NOT EXISTS route_stops_route_id_idx ON route_stops(route_id);
CREATE INDEX IF NOT EXISTS route_stops_stop_id_idx ON route_stops(stop_id);
CREATE INDEX IF NOT EXISTS bus_profiles_bus_number_idx ON bus_profiles(bus_number);
CREATE INDEX IF NOT EXISTS bus_media_bus_number_idx ON bus_media(bus_number);
CREATE INDEX IF NOT EXISTS reviews_bus_number_idx ON reviews(bus_number);
CREATE INDEX IF NOT EXISTS reviews_user_id_idx ON reviews(user_id);

-- 6. Создание функции для updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Создание триггеров
DROP TRIGGER IF EXISTS update_routes_updated_at ON routes;
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bus_profiles_updated_at ON bus_profiles;
CREATE TRIGGER update_bus_profiles_updated_at BEFORE UPDATE ON bus_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reviews_updated_at ON reviews;
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Функция для одного активного маршрута
CREATE OR REPLACE FUNCTION ensure_single_active_route()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE routes SET is_active = false
    WHERE bus_number = NEW.bus_number AND id != NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_single_active_route_trigger ON routes;
CREATE TRIGGER ensure_single_active_route_trigger BEFORE INSERT OR UPDATE ON routes FOR EACH ROW EXECUTE FUNCTION ensure_single_active_route();

-- ============================================
-- ГОТОВО! Теперь создайте Storage Bucket вручную:
-- Storage -> New bucket -> bus-media (public, 20MB limit)
-- ============================================
