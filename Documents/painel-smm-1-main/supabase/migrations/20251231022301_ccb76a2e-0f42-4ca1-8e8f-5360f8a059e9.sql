-- Create table for service customizations
CREATE TABLE public.service_customizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id INTEGER NOT NULL UNIQUE,
  custom_name TEXT,
  custom_description TEXT,
  custom_rate TEXT,
  show_refill_button BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.service_customizations ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for everyone (no auth required since it's a personal panel)
CREATE POLICY "Allow all operations on service_customizations" 
ON public.service_customizations 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create index for faster lookups by service_id
CREATE INDEX idx_service_customizations_service_id ON public.service_customizations(service_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_service_customizations_updated_at
BEFORE UPDATE ON public.service_customizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();