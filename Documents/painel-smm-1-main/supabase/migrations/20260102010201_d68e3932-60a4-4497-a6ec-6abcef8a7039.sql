-- =====================================================
-- API KEYS TABLE - Stores user API keys for external access
-- =====================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id)
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Users can view their own API key
CREATE POLICY "Users can view their own api_key"
  ON public.api_keys
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own API key
CREATE POLICY "Users can insert their own api_key"
  ON public.api_keys
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own API key
CREATE POLICY "Users can update their own api_key"
  ON public.api_keys
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own API key
CREATE POLICY "Users can delete their own api_key"
  ON public.api_keys
  FOR DELETE
  USING (auth.uid() = user_id);

-- Admins can view all API keys
CREATE POLICY "Admins can view all api_keys"
  ON public.api_keys
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_api_key ON public.api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);