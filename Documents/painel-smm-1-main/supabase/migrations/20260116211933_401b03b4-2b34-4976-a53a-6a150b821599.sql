-- Add usage_notes column to store_packages for additional information
ALTER TABLE public.store_packages 
ADD COLUMN IF NOT EXISTS usage_notes TEXT DEFAULT NULL;