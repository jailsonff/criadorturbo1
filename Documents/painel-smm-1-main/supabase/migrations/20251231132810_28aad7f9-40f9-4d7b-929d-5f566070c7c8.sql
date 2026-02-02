-- Create table for AI providers configuration
CREATE TABLE public.ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider_key text NOT NULL UNIQUE,
  api_key_configured boolean DEFAULT false,
  is_enabled boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create table for AI agents
CREATE TABLE public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  use_case text NOT NULL DEFAULT 'custom',
  provider text NOT NULL,
  model text NOT NULL,
  system_prompt text,
  temperature numeric DEFAULT 0.7,
  max_tokens integer DEFAULT 1024,
  is_enabled boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create table for SEO actions
CREATE TABLE public.seo_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  action_type text NOT NULL,
  is_enabled boolean DEFAULT true,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_actions ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_providers
CREATE POLICY "Admins can manage ai_providers"
ON public.ai_providers
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for ai_agents
CREATE POLICY "Admins can manage ai_agents"
ON public.ai_agents
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for seo_actions
CREATE POLICY "Admins can manage seo_actions"
ON public.seo_actions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default providers
INSERT INTO public.ai_providers (name, provider_key, api_key_configured, is_enabled) VALUES
('Google Gemini', 'google', false, false),
('OpenAI ChatGPT', 'openai', false, false),
('Lovable AI', 'lovable', true, false);