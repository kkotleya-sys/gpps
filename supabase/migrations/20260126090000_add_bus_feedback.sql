-- Add bus_feedback table for complaints and crowd level
CREATE TABLE IF NOT EXISTS bus_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number text NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  crowd_level integer CHECK (crowd_level BETWEEN 1 AND 4),
  complaint text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bus_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view bus feedback"
  ON bus_feedback FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create bus feedback"
  ON bus_feedback FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Users can delete their feedback"
  ON bus_feedback FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS bus_feedback_bus_number_idx ON bus_feedback(bus_number);
CREATE INDEX IF NOT EXISTS bus_feedback_user_id_idx ON bus_feedback(user_id);
CREATE INDEX IF NOT EXISTS bus_feedback_created_at_idx ON bus_feedback(created_at);
