-- =====================================================================
-- Starting data: hospital departments patients & reception can select
-- Run AFTER schema.sql in your new Supabase SQL Editor.
-- =====================================================================

insert into departments (name) values
  ('General Medicine'),
  ('Pediatrics'),
  ('Orthopedics'),
  ('Cardiology'),
  ('Dermatology'),
  ('ENT (Ear, Nose & Throat)'),
  ('Gynecology')
on conflict (name) do nothing;
