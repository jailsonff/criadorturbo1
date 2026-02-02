-- Add policy for public access to imported_services when is_active is true
CREATE POLICY "Anyone can view active imported_services publicly" 
ON public.imported_services 
FOR SELECT 
USING (is_active = true);