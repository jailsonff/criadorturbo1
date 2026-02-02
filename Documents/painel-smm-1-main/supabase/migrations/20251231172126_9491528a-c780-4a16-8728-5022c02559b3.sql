-- Add custom_average_time field to service_customizations
ALTER TABLE public.service_customizations 
ADD COLUMN IF NOT EXISTS custom_average_time text;