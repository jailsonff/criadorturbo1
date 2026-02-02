-- Create table for refill requests
CREATE TABLE public.refills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  order_id INTEGER NOT NULL,
  refill_id TEXT,
  link TEXT,
  service_name TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.refills ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own refills"
ON public.refills
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own refills"
ON public.refills
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all refills"
ON public.refills
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_refills_updated_at
BEFORE UPDATE ON public.refills
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();