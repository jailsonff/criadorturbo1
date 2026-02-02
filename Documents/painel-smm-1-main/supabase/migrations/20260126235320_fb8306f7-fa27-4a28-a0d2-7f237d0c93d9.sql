-- Store menu (footer) banners
CREATE TABLE IF NOT EXISTS public.store_menu_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  frontend_id UUID NOT NULL REFERENCES public.store_frontends(id) ON DELETE CASCADE,
  title TEXT,
  image_url TEXT NOT NULL,
  target_url TEXT,
  package_id UUID REFERENCES public.store_packages(id) ON DELETE SET NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_menu_banners_frontend_order
ON public.store_menu_banners(frontend_id, display_order);

ALTER TABLE public.store_menu_banners ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public can view active store menu banners" ON public.store_menu_banners
  FOR SELECT
  USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage store menu banners" ON public.store_menu_banners
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- keep updated_at current
DO $$ BEGIN
  CREATE TRIGGER update_store_menu_banners_updated_at
  BEFORE UPDATE ON public.store_menu_banners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;