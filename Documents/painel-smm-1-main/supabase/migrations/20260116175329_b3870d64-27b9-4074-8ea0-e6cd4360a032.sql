-- Add instagram_handle column to site_settings
ALTER TABLE public.site_settings 
ADD COLUMN IF NOT EXISTS instagram_handle TEXT DEFAULT '@agenciarecife_';

-- Add contact_title column for the contact section title
ALTER TABLE public.site_settings 
ADD COLUMN IF NOT EXISTS contact_section_title TEXT DEFAULT 'Fale com a Agência Recife';