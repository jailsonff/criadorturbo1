-- Create table for API providers/vendors
CREATE TABLE public.smm_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table to track imported services from providers
CREATE TABLE public.imported_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.smm_providers(id) ON DELETE CASCADE,
  external_service_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  type TEXT,
  rate TEXT NOT NULL,
  min TEXT NOT NULL,
  max TEXT NOT NULL,
  refill BOOLEAN DEFAULT false,
  cancel BOOLEAN DEFAULT false,
  description TEXT,
  dripfeed BOOLEAN DEFAULT false,
  average_time TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(provider_id, external_service_id)
);

-- Enable RLS on both tables
ALTER TABLE public.smm_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imported_services ENABLE ROW LEVEL SECURITY;

-- RLS policies for smm_providers - only admins can manage
CREATE POLICY "Admins can manage smm_providers" 
ON public.smm_providers 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for imported_services - admins can manage, all users can view active
CREATE POLICY "Admins can manage imported_services" 
ON public.imported_services 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view active imported_services" 
ON public.imported_services 
FOR SELECT 
USING (auth.uid() IS NOT NULL AND is_active = true);

-- Create trigger for updated_at on smm_providers
CREATE TRIGGER update_smm_providers_updated_at
BEFORE UPDATE ON public.smm_providers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on imported_services
CREATE TRIGGER update_imported_services_updated_at
BEFORE UPDATE ON public.imported_services
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_imported_services_provider ON public.imported_services(provider_id);
CREATE INDEX idx_imported_services_category ON public.imported_services(category);
CREATE INDEX idx_imported_services_active ON public.imported_services(is_active);