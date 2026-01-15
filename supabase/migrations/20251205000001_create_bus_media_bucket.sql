-- Create bus-media storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('bus-media', 'bus-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for bus-media bucket
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
