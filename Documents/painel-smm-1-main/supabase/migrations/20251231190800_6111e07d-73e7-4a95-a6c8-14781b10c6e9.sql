-- Allow authenticated users to read smm_providers for creating orders
CREATE POLICY "Authenticated users can read smm_providers"
ON public.smm_providers
FOR SELECT
USING (auth.uid() IS NOT NULL);