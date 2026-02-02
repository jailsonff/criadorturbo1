-- Add deposit configuration columns to site_settings
ALTER TABLE public.site_settings 
ADD COLUMN IF NOT EXISTS deposit_predefined_values text[] DEFAULT ARRAY['10', '25', '50', '100', '250', '500']::text[],
ADD COLUMN IF NOT EXISTS deposit_minimum numeric DEFAULT 5;