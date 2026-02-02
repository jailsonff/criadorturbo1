-- Adicionar campo api_domain na tabela site_settings para configurar domínio customizado da API
ALTER TABLE public.site_settings 
ADD COLUMN IF NOT EXISTS api_domain TEXT DEFAULT NULL;