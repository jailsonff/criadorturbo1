-- Store banners
CREATE TABLE IF NOT EXISTS public.store_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  frontend_id UUID NOT NULL,
  title TEXT NULL,
  image_url TEXT NOT NULL,
  target_url TEXT NULL,
  package_id UUID NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT store_banners_frontend_id_fkey FOREIGN KEY (frontend_id) REFERENCES public.store_frontends(id) ON DELETE CASCADE,
  CONSTRAINT store_banners_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.store_packages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_store_banners_frontend_order ON public.store_banners(frontend_id, display_order);

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_store_banners_updated_at ON public.store_banners;
CREATE TRIGGER update_store_banners_updated_at
BEFORE UPDATE ON public.store_banners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.store_banners ENABLE ROW LEVEL SECURITY;

-- Public can read only active banners
DROP POLICY IF EXISTS "Public can view active store banners" ON public.store_banners;
CREATE POLICY "Public can view active store banners"
ON public.store_banners
FOR SELECT
USING (is_active = true);

-- Admin full access
DROP POLICY IF EXISTS "Admins can view all store banners" ON public.store_banners;
CREATE POLICY "Admins can view all store banners"
ON public.store_banners
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can insert store banners" ON public.store_banners;
CREATE POLICY "Admins can insert store banners"
ON public.store_banners
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update store banners" ON public.store_banners;
CREATE POLICY "Admins can update store banners"
ON public.store_banners
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete store banners" ON public.store_banners;
CREATE POLICY "Admins can delete store banners"
ON public.store_banners
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
