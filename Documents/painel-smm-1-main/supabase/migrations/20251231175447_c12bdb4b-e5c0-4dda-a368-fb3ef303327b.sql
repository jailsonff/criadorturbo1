-- Create table for category icons customization
CREATE TABLE public.category_icons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.category_icons ENABLE ROW LEVEL SECURITY;

-- Admins can manage category icons
CREATE POLICY "Admins can manage category_icons" 
ON public.category_icons 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- All authenticated users can view category icons
CREATE POLICY "Authenticated users can view category_icons" 
ON public.category_icons 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_category_icons_updated_at
BEFORE UPDATE ON public.category_icons
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();