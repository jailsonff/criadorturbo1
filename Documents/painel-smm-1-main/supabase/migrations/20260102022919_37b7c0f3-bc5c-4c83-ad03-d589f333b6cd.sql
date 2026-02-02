-- Create table for user favorite services
CREATE TABLE public.favorite_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  service_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint to prevent duplicates
ALTER TABLE public.favorite_services 
ADD CONSTRAINT unique_user_service UNIQUE (user_id, service_id);

-- Enable RLS
ALTER TABLE public.favorite_services ENABLE ROW LEVEL SECURITY;

-- Users can view their own favorites
CREATE POLICY "Users can view their own favorites" 
ON public.favorite_services 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can insert their own favorites
CREATE POLICY "Users can insert their own favorites" 
ON public.favorite_services 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own favorites
CREATE POLICY "Users can delete their own favorites" 
ON public.favorite_services 
FOR DELETE 
USING (auth.uid() = user_id);