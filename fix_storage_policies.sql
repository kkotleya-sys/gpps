-- ============================================
-- ИСПРАВЛЕНИЕ ПОЛИТИК STORAGE
-- Выполните этот код в Supabase SQL Editor
-- ============================================

-- 1. Удалить все старые политики для avatars bucket
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their avatar" ON storage.objects;
DROP POLICY IF EXISTS "Public avatar access" ON storage.objects;
DROP POLICY IF EXISTS "Avatar upload" ON storage.objects;

-- 2. Создать правильные политики для avatars bucket
CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR name LIKE auth.uid()::text || '/%'
      OR name LIKE auth.uid()::text || '-%'
    )
  );

CREATE POLICY "Users can update their avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR name LIKE auth.uid()::text || '/%'
      OR name LIKE auth.uid()::text || '-%'
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR name LIKE auth.uid()::text || '/%'
      OR name LIKE auth.uid()::text || '-%'
    )
  );

CREATE POLICY "Users can delete their avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR name LIKE auth.uid()::text || '/%'
      OR name LIKE auth.uid()::text || '-%'
    )
  );

-- 3. Удалить все старые политики для bus-media bucket
DROP POLICY IF EXISTS "Anyone can view bus media" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can upload bus media" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can update their bus media" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can delete their bus media" ON storage.objects;

-- 4. Создать правильные политики для bus-media bucket
CREATE POLICY "Anyone can view bus media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bus-media');

CREATE POLICY "Drivers can upload bus media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'bus-media'
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 2
      )
      OR EXISTS (
        SELECT 1 FROM bus_profiles
        WHERE driver_id = auth.uid()
      )
    )
  );

CREATE POLICY "Drivers can update their bus media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'bus-media'
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 2
      )
      OR EXISTS (
        SELECT 1 FROM bus_profiles
        WHERE driver_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'bus-media'
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 2
      )
      OR EXISTS (
        SELECT 1 FROM bus_profiles
        WHERE driver_id = auth.uid()
      )
    )
  );

CREATE POLICY "Drivers can delete their bus media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'bus-media'
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 2
      )
      OR EXISTS (
        SELECT 1 FROM bus_profiles
        WHERE driver_id = auth.uid()
      )
    )
  );

-- ============================================
-- ГОТОВО! Теперь загрузка файлов должна работать
-- ============================================
