-- Add link_label column to store_packages for customizable link field label
ALTER TABLE public.store_packages 
ADD COLUMN IF NOT EXISTS link_label TEXT;