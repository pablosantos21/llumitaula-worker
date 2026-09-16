-- A half-applied change pointed meal_records.recorded_by at monitors(id)
-- while the authorship trigger, every RLS write policy and
-- record_meal_incident all require recorded_by = auth.uid() (users.id).
-- Both constraints could never hold at once, so every meal_records write
-- failed. The codebase convention (fase_2_auth_security) is users(id):
-- restore it.
ALTER TABLE public.meal_records
  DROP CONSTRAINT IF EXISTS meal_records_recorded_by_fkey;

ALTER TABLE public.meal_records
  ALTER COLUMN recorded_by SET NOT NULL;

ALTER TABLE public.meal_records
  ADD CONSTRAINT meal_records_recorded_by_fkey
  FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE CASCADE;
