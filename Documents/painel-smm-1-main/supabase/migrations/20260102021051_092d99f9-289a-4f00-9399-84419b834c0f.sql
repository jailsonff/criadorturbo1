-- Add column to control services page visibility
ALTER TABLE public.site_settings 
ADD COLUMN IF NOT EXISTS services_page_public boolean DEFAULT false;