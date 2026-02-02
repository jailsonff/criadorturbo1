-- Add icon_type column to differentiate between emoji and image
ALTER TABLE public.category_icons 
ADD COLUMN icon_type TEXT NOT NULL DEFAULT 'emoji' CHECK (icon_type IN ('emoji', 'image'));

-- Create storage bucket for category icons
INSERT INTO storage.buckets (id, name, public) 
VALUES ('category-icons', 'category-icons', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view category icons
CREATE POLICY "Public can view category icons"
ON storage.objects FOR SELECT
USING (bucket_id = 'category-icons');

-- Allow admins to upload category icons
CREATE POLICY "Admins can upload category icons"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'category-icons' AND has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete category icons
CREATE POLICY "Admins can delete category icons"
ON storage.objects FOR DELETE
USING (bucket_id = 'category-icons' AND has_role(auth.uid(), 'admin'::app_role));