-- Table to store storefront client-side error logs (no full phone stored)
CREATE TABLE IF NOT EXISTS public.store_client_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'storefront',
  event_name text NOT NULL DEFAULT 'checkout_error',
  checkout_req_id text NULL,
  frontend_id uuid NULL,
  package_id uuid NULL,
  order_id uuid NULL,
  mode text NULL,
  phone_masked text NULL,
  phone_last4 text NULL,
  phone_len int NULL,
  user_agent text NULL,
  url text NULL,
  message text NULL,
  error_json jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_store_client_error_logs_created_at ON public.store_client_error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_client_error_logs_event_name ON public.store_client_error_logs (event_name);
CREATE INDEX IF NOT EXISTS idx_store_client_error_logs_checkout_req_id ON public.store_client_error_logs (checkout_req_id);

ALTER TABLE public.store_client_error_logs ENABLE ROW LEVEL SECURITY;

-- Anyone can insert logs (public storefront), but cannot read them.
DROP POLICY IF EXISTS "Anyone can insert store_client_error_logs" ON public.store_client_error_logs;
CREATE POLICY "Anyone can insert store_client_error_logs"
ON public.store_client_error_logs
FOR INSERT
WITH CHECK (
  -- basic sanity limits
  (event_name IS NOT NULL AND length(trim(event_name)) > 0 AND length(event_name) <= 80)
);

DROP POLICY IF EXISTS "Admins can read store_client_error_logs" ON public.store_client_error_logs;
CREATE POLICY "Admins can read store_client_error_logs"
ON public.store_client_error_logs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- No UPDATE/DELETE policies: immutable logs.

-- Cleanup function (kept SECURITY DEFINER to allow edge functions/service role or future admin actions)
CREATE OR REPLACE FUNCTION public.cleanup_store_client_error_logs(retention_days int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  retention_days := GREATEST(1, LEAST(retention_days, 90));

  DELETE FROM public.store_client_error_logs
  WHERE created_at < (now() - make_interval(days => retention_days));

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;