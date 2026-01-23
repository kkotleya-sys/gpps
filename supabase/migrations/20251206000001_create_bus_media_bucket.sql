-- Create bus-media storage bucket
-- Note: This needs to be run in Supabase Dashboard -> Storage -> Create Bucket
-- Or via SQL in Supabase SQL Editor

-- Insert bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bus-media',
  'bus-media',
  true,
  20971520, -- 20 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];

-- Storage policies for bus-media bucket
DROP POLICY IF EXISTS "Anyone can view bus media" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can upload bus media" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can update their bus media" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can delete their bus media" ON storage.objects;

CREATE POLICY "Anyone can view bus media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bus-media');

CREATE POLICY "Drivers can upload bus media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'bus-media'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 2
    )
  );

CREATE POLICY "Drivers can update their bus media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'bus-media'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 2
    )
  );

CREATE POLICY "Drivers can delete their bus media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'bus-media'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 2
    )
  );
