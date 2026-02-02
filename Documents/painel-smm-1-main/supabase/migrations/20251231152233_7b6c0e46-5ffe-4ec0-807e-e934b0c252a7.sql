-- Create table for site SEO settings
CREATE TABLE public.site_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Basic SEO
  site_title text NOT NULL DEFAULT 'UpMidias - Painel SMM',
  site_description text NOT NULL DEFAULT 'A melhor plataforma SMM do Brasil. Aumente seguidores, curtidas e visualizações.',
  
  -- Meta Keywords
  meta_keywords text DEFAULT 'smm, social media, seguidores, curtidas, instagram, youtube, tiktok',
  
  -- Open Graph (Social Sharing)
  og_title text DEFAULT 'UpMidias - Impulsione suas Redes Sociais',
  og_description text DEFAULT 'A melhor plataforma SMM do Brasil com entrega automática e instantânea.',
  og_image_url text DEFAULT NULL,
  
  -- Twitter Card
  twitter_card text DEFAULT 'summary_large_image',
  twitter_title text DEFAULT NULL,
  twitter_description text DEFAULT NULL,
  
  -- Favicon
  favicon_url text DEFAULT NULL,
  
  -- Additional SEO
  robots_content text DEFAULT 'index, follow',
  canonical_url text DEFAULT NULL,
  google_analytics_id text DEFAULT NULL,
  
  -- Metadata
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can view settings
CREATE POLICY "Anyone can view site settings"
ON public.site_settings
FOR SELECT
USING (true);

-- Only admins can update
CREATE POLICY "Admins can update site settings"
ON public.site_settings
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert
CREATE POLICY "Admins can insert site settings"
ON public.site_settings
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Insert default settings
INSERT INTO public.site_settings (id) VALUES (gen_random_uuid());

-- Create storage bucket for site assets (favicon, og images)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('site-assets', 'site-assets', true);

-- Storage policies for site-assets bucket
CREATE POLICY "Anyone can view site assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'site-assets');

CREATE POLICY "Admins can upload site assets"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'site-assets' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update site assets"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'site-assets' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete site assets"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'site-assets' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);