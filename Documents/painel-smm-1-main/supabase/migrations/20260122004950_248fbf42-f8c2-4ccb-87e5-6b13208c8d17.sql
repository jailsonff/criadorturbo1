-- Store popups (interactive image with hotspots)

CREATE TABLE IF NOT EXISTS public.store_popups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  frontend_id uuid NULL,
  name text NOT NULL DEFAULT 'Popup',
  image_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  -- scheduling
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  -- display rules
  trigger_type text NOT NULL DEFAULT 'on_load', -- on_load | after_delay
  delay_ms integer NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'once_per_visitor', -- always | once_per_visitor | once_per_day
  dismiss_ttl_hours integer NOT NULL DEFAULT 720, -- 30 days
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_popups_frontend_active
  ON public.store_popups (frontend_id, is_active, priority);

CREATE TABLE IF NOT EXISTS public.store_popup_hotspots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  popup_id uuid NOT NULL REFERENCES public.store_popups(id) ON DELETE CASCADE,
  title text NULL,
  x_pct numeric NOT NULL DEFAULT 0,
  y_pct numeric NOT NULL DEFAULT 0,
  w_pct numeric NOT NULL DEFAULT 10,
  h_pct numeric NOT NULL DEFAULT 10,
  action_type text NOT NULL DEFAULT 'open_package', -- open_package | open_url
  package_id uuid NULL REFERENCES public.store_packages(id) ON DELETE SET NULL,
  target_url text NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_popup_hotspots_popup
  ON public.store_popup_hotspots (popup_id, is_active, display_order);

-- Enable RLS
ALTER TABLE public.store_popups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_popup_hotspots ENABLE ROW LEVEL SECURITY;

-- Policies: public can view active popups/hotspots (store is public)
DO $$ BEGIN
  CREATE POLICY "Public can view active store popups"
  ON public.store_popups
  FOR SELECT
  USING (
    is_active = true
    AND (starts_at IS NULL OR now() >= starts_at)
    AND (ends_at IS NULL OR now() <= ends_at)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public can view active store popup hotspots"
  ON public.store_popup_hotspots
  FOR SELECT
  USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Admin manage
DO $$ BEGIN
  CREATE POLICY "Admins can manage store popups"
  ON public.store_popups
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage store popup hotspots"
  ON public.store_popup_hotspots
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at triggers
DO $$ BEGIN
  CREATE TRIGGER update_store_popups_updated_at
  BEFORE UPDATE ON public.store_popups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_store_popup_hotspots_updated_at
  BEFORE UPDATE ON public.store_popup_hotspots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
