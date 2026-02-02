-- Create store package sections (sessions)
CREATE TABLE IF NOT EXISTS public.store_package_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  frontend_id UUID REFERENCES public.store_frontends(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (frontend_id, name)
);

ALTER TABLE public.store_package_sections ENABLE ROW LEVEL SECURITY;

-- Admin policies
DO $$ BEGIN
  CREATE POLICY "Admins can manage store_package_sections" ON public.store_package_sections
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Public read of active sections
DO $$ BEGIN
  CREATE POLICY "Anyone can view active store_package_sections" ON public.store_package_sections
  FOR SELECT
  USING (COALESCE(is_active, true) = true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- updated_at trigger
DO $$ BEGIN
  CREATE TRIGGER update_store_package_sections_updated_at
  BEFORE UPDATE ON public.store_package_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Link packages to a section
ALTER TABLE public.store_packages
ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.store_package_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_store_packages_section_id ON public.store_packages(section_id);

-- Seed default sections per frontend
INSERT INTO public.store_package_sections (frontend_id, name, display_order, is_active)
SELECT sf.id, v.name, v.display_order, true
FROM public.store_frontends sf
CROSS JOIN (VALUES
  ('Engajamento', 0),
  ('Combos Promocionais', 1)
) AS v(name, display_order)
ON CONFLICT (frontend_id, name) DO NOTHING;

-- Assign existing packages to default sections (COMBO keyword => Combos)
UPDATE public.store_packages p
SET section_id = COALESCE(
  (SELECT s.id FROM public.store_package_sections s
   WHERE s.frontend_id = p.frontend_id
     AND s.name = 
       CASE
         WHEN LOWER(COALESCE(p.name, '') || ' ' || COALESCE(p.badge_text, '')) LIKE '%combo%'
           THEN 'Combos Promocionais'
         ELSE 'Engajamento'
       END
   LIMIT 1
  ),
  NULL
)
WHERE p.section_id IS NULL;