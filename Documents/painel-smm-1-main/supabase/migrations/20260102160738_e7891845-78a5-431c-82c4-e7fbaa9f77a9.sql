-- Add contact settings columns to site_settings
ALTER TABLE public.site_settings
ADD COLUMN IF NOT EXISTS whatsapp_number text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS support_email text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS business_hours text DEFAULT 'Segunda a Sexta: 9h às 18h | Sábado: 9h às 14h';