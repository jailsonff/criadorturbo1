-- Add custom_min and custom_max columns to service_customizations table
ALTER TABLE public.service_customizations
ADD COLUMN IF NOT EXISTS custom_min text NULL,
ADD COLUMN IF NOT EXISTS custom_max text NULL;