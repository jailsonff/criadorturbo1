
-- =====================================================
-- CATEGORY DISPLAY ORDER TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.category_display_order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.category_display_order ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view category_display_order" ON public.category_display_order FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage category_display_order" ON public.category_display_order FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- ADD DISPLAY ORDER TO IMPORTED SERVICES
-- =====================================================
ALTER TABLE public.imported_services 
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Create index for faster ordering
CREATE INDEX IF NOT EXISTS idx_imported_services_display_order ON public.imported_services(category, display_order);
CREATE INDEX IF NOT EXISTS idx_category_display_order_order ON public.category_display_order(display_order);
