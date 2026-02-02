-- PWA settings stored in existing site_settings row
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS pwa_name text,
  ADD COLUMN IF NOT EXISTS pwa_short_name text,
  ADD COLUMN IF NOT EXISTS pwa_theme_color text,
  ADD COLUMN IF NOT EXISTS pwa_background_color text,
  ADD COLUMN IF NOT EXISTS pwa_icon_192_url text,
  ADD COLUMN IF NOT EXISTS pwa_icon_512_url text,
  ADD COLUMN IF NOT EXISTS pwa_splash_url text,
  ADD COLUMN IF NOT EXISTS pwa_push_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pwa_vapid_public_key text;

-- Push subscriptions (Android-first; restrict reads to admins)
CREATE TABLE IF NOT EXISTS public.pwa_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pwa_push_subscriptions_endpoint_uq
  ON public.pwa_push_subscriptions(endpoint);

ALTER TABLE public.pwa_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Anyone can create a subscription (public PWA visitors)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='pwa_push_subscriptions' AND policyname='Anyone can insert push subscriptions'
  ) THEN
    CREATE POLICY "Anyone can insert push subscriptions"
    ON public.pwa_push_subscriptions
    FOR INSERT
    WITH CHECK (
      length(trim(endpoint)) > 0
      AND length(trim(p256dh)) > 0
      AND length(trim(auth)) > 0
    );
  END IF;
END$$;

-- Admins can view subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='pwa_push_subscriptions' AND policyname='Admins can view push subscriptions'
  ) THEN
    CREATE POLICY "Admins can view push subscriptions"
    ON public.pwa_push_subscriptions
    FOR SELECT
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END$$;

-- Admins can update subscriptions (disable/cleanup)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='pwa_push_subscriptions' AND policyname='Admins can update push subscriptions'
  ) THEN
    CREATE POLICY "Admins can update push subscriptions"
    ON public.pwa_push_subscriptions
    FOR UPDATE
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END$$;

-- updated_at trigger
DROP TRIGGER IF EXISTS update_pwa_push_subscriptions_updated_at ON public.pwa_push_subscriptions;
CREATE TRIGGER update_pwa_push_subscriptions_updated_at
BEFORE UPDATE ON public.pwa_push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
