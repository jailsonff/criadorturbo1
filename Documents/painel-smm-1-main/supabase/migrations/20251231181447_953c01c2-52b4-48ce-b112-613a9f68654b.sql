-- Create table for custom platform icons
CREATE TABLE public.platform_icons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon_url TEXT NOT NULL,
  bg_color TEXT NOT NULL DEFAULT 'bg-gray-600',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_icons ENABLE ROW LEVEL SECURITY;

-- Allow public read for all users
CREATE POLICY "Anyone can view platform icons"
ON public.platform_icons
FOR SELECT
USING (true);

-- Only admins can manage platform icons
CREATE POLICY "Admins can manage platform icons"
ON public.platform_icons
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_platform_icons_updated_at
BEFORE UPDATE ON public.platform_icons
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create table to link platforms to categories
CREATE TABLE public.platform_category_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform_id UUID NOT NULL REFERENCES public.platform_icons(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(platform_id, category_name)
);

-- Enable RLS
ALTER TABLE public.platform_category_links ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "Anyone can view platform category links"
ON public.platform_category_links
FOR SELECT
USING (true);

-- Only admins can manage links
CREATE POLICY "Admins can manage platform category links"
ON public.platform_category_links
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));