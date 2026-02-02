-- Add column to control which landing page is the main one
ALTER TABLE public.site_settings 
ADD COLUMN IF NOT EXISTS use_store_landing boolean DEFAULT false;

-- Add column to specify which store frontend slug to use as main landing
ALTER TABLE public.site_settings 
ADD COLUMN IF NOT EXISTS store_landing_slug text DEFAULT 'loja';

COMMENT ON COLUMN public.site_settings.use_store_landing IS 'When true, the store landing page is used as the main landing page';
COMMENT ON COLUMN public.site_settings.store_landing_slug IS 'The slug of the store frontend to use as main landing';