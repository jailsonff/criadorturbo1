-- Create table to persist external DB connection config per admin user
CREATE TABLE IF NOT EXISTS public.external_database_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  url text NOT NULL,
  anon_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.external_database_configs ENABLE ROW LEVEL SECURITY;

-- Only admins can manage these configs
DO $$ BEGIN
  CREATE POLICY "Admins can manage external db configs"
  ON public.external_database_configs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- updated_at trigger
DO $$ BEGIN
  CREATE TRIGGER update_external_database_configs_updated_at
  BEFORE UPDATE ON public.external_database_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_external_database_configs_user_id ON public.external_database_configs(user_id);