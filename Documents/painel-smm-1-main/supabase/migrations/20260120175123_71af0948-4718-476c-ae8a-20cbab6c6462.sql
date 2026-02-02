DO $$ BEGIN
  CREATE POLICY "Service role can manage store_order_links" ON public.store_order_links
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;