
-- Add default category and service columns to site_settings
ALTER TABLE public.site_settings 
ADD COLUMN IF NOT EXISTS default_order_category TEXT,
ADD COLUMN IF NOT EXISTS default_order_service_id INTEGER;
