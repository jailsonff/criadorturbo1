// Complete database schema for white-label deployment
// This schema will be executed when a client connects their own Supabase project

export const DATABASE_SCHEMA = `
-- =====================================================
-- SMM PANEL - COMPLETE DATABASE SCHEMA
-- This script creates all necessary tables, functions,
-- triggers, and RLS policies for the SMM Panel
-- =====================================================

-- Create enum for user roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create enum for ticket status
DO $$ BEGIN
  CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'resolved');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- PROFILES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  balance NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- USER ROLES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- HAS_ROLE FUNCTION (Security Definer)
-- =====================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS Policies for user_roles (must be after has_role function)
DO $$ BEGIN
  CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Admin policies for profiles (after has_role)
DO $$ BEGIN
  CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- SMM PROVIDERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.smm_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.smm_providers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can read smm_providers" ON public.smm_providers FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage smm_providers" ON public.smm_providers FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- IMPORTED SERVICES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.imported_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.smm_providers(id) ON DELETE CASCADE,
  external_service_id INTEGER NOT NULL,
  internal_provider_service_id INTEGER,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  type TEXT,
  rate TEXT NOT NULL,
  min TEXT NOT NULL,
  max TEXT NOT NULL,
  description TEXT,
  average_time TEXT,
  refill BOOLEAN DEFAULT false,
  cancel BOOLEAN DEFAULT false,
  dripfeed BOOLEAN DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.imported_services ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can view active imported_services" ON public.imported_services FOR SELECT USING ((auth.uid() IS NOT NULL) AND (is_active = true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can view active imported_services publicly" ON public.imported_services FOR SELECT USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage imported_services" ON public.imported_services FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- SERVICE CUSTOMIZATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.service_customizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id INTEGER NOT NULL,
  custom_name TEXT,
  custom_description TEXT,
  custom_rate TEXT,
  custom_average_time TEXT,
  custom_min TEXT,
  custom_max TEXT,
  is_active BOOLEAN DEFAULT true,
  show_refill_button BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add custom_min and custom_max columns if they don't exist (for existing installs)
DO $$ BEGIN
  ALTER TABLE public.service_customizations ADD COLUMN custom_min TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.service_customizations ADD COLUMN custom_max TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

ALTER TABLE public.service_customizations ENABLE ROW LEVEL SECURITY;

-- Public read of active customizations; writes restricted to admins
DO $$ BEGIN
  CREATE POLICY "Anyone can view active service_customizations" ON public.service_customizations
  FOR SELECT
  USING (COALESCE(is_active, true) = true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage service_customizations" ON public.service_customizations
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- CATEGORY DISPLAY ORDER TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.category_display_order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.category_display_order ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view category_display_order" ON public.category_display_order FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage category_display_order" ON public.category_display_order FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_category_display_order_order ON public.category_display_order(display_order);

-- =====================================================
-- ORDERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  order_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  service_name TEXT NOT NULL,
  link TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  charge NUMERIC,
  status TEXT DEFAULT 'pending',
  start_count TEXT,
  remains TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own orders" ON public.orders FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- REFILLS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.refills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  order_id INTEGER NOT NULL,
  refill_id TEXT,
  link TEXT,
  service_name TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.refills ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own refills" ON public.refills FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own refills" ON public.refills FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can view all refills" ON public.refills FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update all refills" ON public.refills FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- BALANCE HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.balance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'pix',
  payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.balance_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own balance history" ON public.balance_history FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own balance history" ON public.balance_history FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can view all balance history" ON public.balance_history FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_balance_history_user_id ON public.balance_history(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_history_created_at ON public.balance_history(created_at DESC);

-- =====================================================
-- SUPPORT TICKETS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  order_id TEXT,
  status ticket_status NOT NULL DEFAULT 'open',
  admin_response TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own tickets" ON public.support_tickets FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own tickets" ON public.support_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can view all tickets" ON public.support_tickets FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update all tickets" ON public.support_tickets FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- TICKET MESSAGES TABLE (Chat History)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Ensure sender_type constraint is correct (fixes older installs)
DO $$ BEGIN
  ALTER TABLE public.ticket_messages DROP CONSTRAINT IF EXISTS valid_sender_type;
  ALTER TABLE public.ticket_messages ADD CONSTRAINT valid_sender_type
    CHECK (sender_type IN ('user', 'support', 'admin', 'ai'));
EXCEPTION WHEN undefined_table THEN null; END $$;

ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view messages from their tickets" ON public.ticket_messages FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.support_tickets WHERE support_tickets.id = ticket_messages.ticket_id AND support_tickets.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can send messages to their tickets" ON public.ticket_messages FOR INSERT 
  WITH CHECK (sender_type = 'user' AND EXISTS (SELECT 1 FROM public.support_tickets WHERE support_tickets.id = ticket_messages.ticket_id AND support_tickets.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can view all messages" ON public.ticket_messages FOR SELECT 
  USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can send messages" ON public.ticket_messages FOR INSERT 
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert messages" ON public.ticket_messages FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON public.ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created_at ON public.ticket_messages(created_at);

-- =====================================================
-- PLATFORM ICONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.platform_icons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon_url TEXT NOT NULL,
  bg_color TEXT NOT NULL DEFAULT 'bg-gray-600',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_icons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view platform icons" ON public.platform_icons FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage platform icons" ON public.platform_icons FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- PLATFORM CATEGORY LINKS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.platform_category_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES public.platform_icons(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_category_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view platform category links" ON public.platform_category_links FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage platform category links" ON public.platform_category_links FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- CATEGORY ICONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.category_icons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL,
  icon TEXT NOT NULL,
  icon_type TEXT NOT NULL DEFAULT 'emoji',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.category_icons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can view category_icons" ON public.category_icons FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage category_icons" ON public.category_icons FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- LANDING CONTENT TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.landing_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name TEXT NOT NULL DEFAULT 'UpMidias',
  hero_badge_text TEXT NOT NULL DEFAULT 'Sistema Online • +10.000 pedidos entregues',
  hero_title_line1 TEXT NOT NULL DEFAULT 'Impulsione suas',
  hero_title_highlight TEXT NOT NULL DEFAULT 'Redes Sociais',
  hero_subtitle TEXT NOT NULL DEFAULT 'A melhor plataforma SMM do Brasil.',
  hero_button_primary TEXT NOT NULL DEFAULT 'Acessar Painel',
  hero_button_secondary TEXT NOT NULL DEFAULT 'Criar Conta',
  features_title TEXT NOT NULL DEFAULT 'Por que escolher a',
  features_title_highlight TEXT NOT NULL DEFAULT 'UpMidias',
  features_subtitle TEXT NOT NULL DEFAULT 'Oferecemos os melhores serviços de SMM',
  feature1_icon TEXT NOT NULL DEFAULT 'Zap',
  feature1_title TEXT NOT NULL DEFAULT 'Entrega Instantânea',
  feature1_description TEXT NOT NULL DEFAULT 'Seus pedidos são processados em tempo recorde.',
  feature2_icon TEXT NOT NULL DEFAULT 'Shield',
  feature2_title TEXT NOT NULL DEFAULT '100% Seguro',
  feature2_description TEXT NOT NULL DEFAULT 'Garantimos a segurança das suas contas.',
  feature3_icon TEXT NOT NULL DEFAULT 'Clock',
  feature3_title TEXT NOT NULL DEFAULT 'Suporte 24/7',
  feature3_description TEXT NOT NULL DEFAULT 'Nossa equipe está sempre disponível.',
  feature4_icon TEXT NOT NULL DEFAULT 'TrendingUp',
  feature4_title TEXT NOT NULL DEFAULT 'Melhor Preço',
  feature4_description TEXT NOT NULL DEFAULT 'Os melhores serviços com os menores preços.',
  cta_title TEXT NOT NULL DEFAULT 'Pronto para começar?',
  cta_subtitle TEXT NOT NULL DEFAULT 'Crie sua conta gratuitamente.',
  cta_button_text TEXT NOT NULL DEFAULT 'Criar Conta Grátis',
  footer_copyright TEXT NOT NULL DEFAULT '© 2024 UpMidias. Todos os direitos reservados.',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.landing_content ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view landing content" ON public.landing_content FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update landing content" ON public.landing_content FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can insert landing content" ON public.landing_content FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Insert default landing content with full data
INSERT INTO public.landing_content (
  site_name, hero_badge_text, hero_title_line1, hero_title_highlight, hero_subtitle,
  hero_button_primary, hero_button_secondary,
  features_title, features_title_highlight, features_subtitle,
  feature1_icon, feature1_title, feature1_description,
  feature2_icon, feature2_title, feature2_description,
  feature3_icon, feature3_title, feature3_description,
  feature4_icon, feature4_title, feature4_description,
  cta_title, cta_subtitle, cta_button_text,
  footer_copyright
) VALUES (
  'SMM Panel',
  '🚀 Plataforma #1 em Marketing Digital',
  'Impulsione suas',
  'Redes Sociais',
  'A plataforma mais completa para gerenciar e impulsionar sua presença nas redes sociais. Resultados reais, entrega rápida.',
  'Começar Agora',
  'Ver Serviços',
  'Por que escolher',
  'nossa plataforma',
  'Oferecemos as melhores soluções para impulsionar sua presença digital',
  'Zap',
  'Entrega Rápida',
  'Seus pedidos são processados e entregues em tempo recorde, garantindo resultados imediatos.',
  'Shield',
  'Segurança Total',
  'Sua conta e dados estão protegidos com as mais avançadas tecnologias de segurança.',
  'TrendingUp',
  'Resultados Reais',
  'Crescimento orgânico e engajamento genuíno para suas redes sociais.',
  'Headphones',
  'Suporte 24/7',
  'Nossa equipe está sempre disponível para ajudar você com qualquer dúvida.',
  'Pronto para crescer?',
  'Junte-se a milhares de clientes satisfeitos e leve suas redes sociais para o próximo nível.',
  'Criar Conta Grátis',
  '© 2024 SMM Panel. Todos os direitos reservados.'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- SITE SETTINGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_title TEXT NOT NULL DEFAULT 'UpMidias - Painel SMM',
  site_description TEXT NOT NULL DEFAULT 'A melhor plataforma SMM do Brasil.',
  meta_keywords TEXT DEFAULT 'smm, social media, seguidores',
  og_title TEXT DEFAULT 'UpMidias - Impulsione suas Redes Sociais',
  og_description TEXT DEFAULT 'A melhor plataforma SMM do Brasil.',
  og_image_url TEXT,
  twitter_card TEXT DEFAULT 'summary_large_image',
  twitter_title TEXT,
  twitter_description TEXT,
  favicon_url TEXT,
  canonical_url TEXT,
  robots_content TEXT DEFAULT 'index, follow',
  google_analytics_id TEXT,
  api_domain TEXT,
  services_page_public BOOLEAN DEFAULT false,
  default_order_category TEXT,
  default_order_service_id INTEGER,
  deposit_minimum NUMERIC DEFAULT 5,
  deposit_predefined_values TEXT[] DEFAULT ARRAY['10', '25', '50', '100', '250', '500'],
  whatsapp_number TEXT,
  support_email TEXT,
  business_hours TEXT DEFAULT 'Segunda a Sexta: 9h às 18h | Sábado: 9h às 14h',
  contact_section_title TEXT DEFAULT 'Fale com a Agência Recife',
  instagram_handle TEXT DEFAULT '@agenciarecife_',
  android_apk_url TEXT,
  android_apk_download_url TEXT,
  android_apk_direct_url TEXT,
  android_apk_version TEXT,
  use_store_landing BOOLEAN DEFAULT false,
  store_landing_slug TEXT DEFAULT 'loja',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view site settings" ON public.site_settings FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update site settings" ON public.site_settings FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can insert site settings" ON public.site_settings FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Add columns if they don't exist (for existing installs)
DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN deposit_minimum NUMERIC DEFAULT 5;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN deposit_predefined_values TEXT[] DEFAULT ARRAY['10', '25', '50', '100', '250', '500'];
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN default_order_category TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN default_order_service_id INTEGER;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN whatsapp_number TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN support_email TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN business_hours TEXT DEFAULT 'Segunda a Sexta: 9h às 18h | Sábado: 9h às 14h';
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN contact_section_title TEXT DEFAULT 'Fale com a Agência Recife';
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN instagram_handle TEXT DEFAULT '@agenciarecife_';
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN android_apk_url TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN android_apk_download_url TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN android_apk_direct_url TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN android_apk_version TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN use_store_landing BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.site_settings ADD COLUMN store_landing_slug TEXT DEFAULT 'loja';
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- Insert default site settings with full SEO data
INSERT INTO public.site_settings (
  site_title, site_description, meta_keywords, robots_content
) VALUES (
  'SMM Panel - Painel de Marketing Digital',
  'A plataforma mais completa para gerenciar e impulsionar sua presença nas redes sociais. Resultados reais, entrega rápida.',
  'smm panel, marketing digital, redes sociais, seguidores, likes, views, instagram, tiktok, youtube',
  'index, follow'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- TERMS CONTENT TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.terms_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Termos de Serviço',
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.terms_content ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view terms" ON public.terms_content FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update terms" ON public.terms_content FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can insert terms" ON public.terms_content FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Insert default terms content with sample data
INSERT INTO public.terms_content (title, content) VALUES (
  'Termos de Uso',
  '# Termos de Uso

## 1. Aceitação dos Termos

Ao acessar e usar nossa plataforma, você concorda com estes termos de uso.

## 2. Uso do Serviço

Nossos serviços devem ser utilizados de acordo com as políticas de cada rede social.

## 3. Responsabilidades

O usuário é responsável por manter a segurança de sua conta e senha.

## 4. Pagamentos

Todos os pagamentos são processados de forma segura. Reembolsos seguem nossa política específica.

## 5. Contato

Para dúvidas, entre em contato através do nosso suporte.'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- PRIVACY CONTENT TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.privacy_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Política de Privacidade',
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.privacy_content ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view privacy" ON public.privacy_content FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update privacy" ON public.privacy_content FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can insert privacy" ON public.privacy_content FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Insert default privacy content with sample data
INSERT INTO public.privacy_content (title, content) VALUES (
  'Política de Privacidade',
  '# Política de Privacidade

## 1. Coleta de Dados

Coletamos apenas as informações necessárias para fornecer nossos serviços.

## 2. Uso das Informações

Suas informações são usadas exclusivamente para processar pedidos e melhorar nossos serviços.

## 3. Proteção de Dados

Utilizamos criptografia e medidas de segurança para proteger suas informações.

## 4. Compartilhamento

Não compartilhamos suas informações pessoais com terceiros.

## 5. Seus Direitos

Você pode solicitar acesso, correção ou exclusão de seus dados a qualquer momento.'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- AI PROVIDERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  api_key_configured BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can manage ai_providers" ON public.ai_providers FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Insert default AI providers
INSERT INTO public.ai_providers (name, provider_key, is_enabled) VALUES
  ('Google AI', 'google', false),
  ('OpenAI', 'openai', false)
ON CONFLICT DO NOTHING;

-- =====================================================
-- AI AGENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  use_case TEXT NOT NULL DEFAULT 'custom',
  system_prompt TEXT,
  temperature NUMERIC DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 1024,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can manage ai_agents" ON public.ai_agents FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- SEO ACTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.seo_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  description TEXT,
  agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.seo_actions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can manage seo_actions" ON public.seo_actions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- FAVORITE SERVICES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.favorite_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  service_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, service_id)
);

ALTER TABLE public.favorite_services ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own favorites" ON public.favorite_services FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own favorites" ON public.favorite_services FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own favorites" ON public.favorite_services FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_favorite_services_user_id ON public.favorite_services(user_id);

-- =====================================================
-- API KEYS TABLE - Stores user API keys for external access
-- =====================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id)
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own api_key" ON public.api_keys FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own api_key" ON public.api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own api_key" ON public.api_keys FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own api_key" ON public.api_keys FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can view all api_keys" ON public.api_keys FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_api_keys_api_key ON public.api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);

-- =====================================================
-- HANDLE NEW USER FUNCTION & TRIGGER
-- Primeiro usuário será automaticamente ADMIN
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_exists BOOLEAN;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  );
  
  -- Check if any admin exists
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  ) INTO admin_exists;
  
  -- If no admin exists, make this user admin; otherwise assign 'user' role
  IF NOT admin_exists THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'user');
  END IF;
  
  RETURN new;
END;
$$;

-- Create trigger for new user registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- UPDATE TIMESTAMP FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- =====================================================
-- STORE (FRONTENDS / PACKAGES / ORDERS)
-- =====================================================

-- Store frontends (landing pages)
CREATE TABLE IF NOT EXISTS public.store_frontends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  cta_title TEXT DEFAULT 'Quer ENGAJAMENTO?',
  cta_subtitle TEXT DEFAULT 'Escolha os pacotes desejados',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.store_frontends ENABLE ROW LEVEL SECURITY;

-- Admin CRUD with explicit INSERT/UPDATE checks (avoids RLS insert errors)
DO $$ BEGIN
  CREATE POLICY "Admins can select store_frontends" ON public.store_frontends
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can insert store_frontends" ON public.store_frontends
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update store_frontends" ON public.store_frontends
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can delete store_frontends" ON public.store_frontends
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can view active frontends" ON public.store_frontends
  FOR SELECT
  USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_store_frontends_updated_at
  BEFORE UPDATE ON public.store_frontends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Store package sections (for grouping packages on storefront)
CREATE TABLE IF NOT EXISTS public.store_package_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  frontend_id UUID REFERENCES public.store_frontends(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (frontend_id, name)
);

ALTER TABLE public.store_package_sections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can manage store_package_sections" ON public.store_package_sections
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can view active store_package_sections" ON public.store_package_sections
  FOR SELECT
  USING (COALESCE(is_active, true) = true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_store_package_sections_updated_at
  BEFORE UPDATE ON public.store_package_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Seed default sections per frontend
INSERT INTO public.store_package_sections (frontend_id, name, display_order, is_active)
SELECT sf.id, v.name, v.display_order, true
FROM public.store_frontends sf
CROSS JOIN (VALUES
  ('Engajamento', 0),
  ('Combos Promocionais', 1)
) AS v(name, display_order)
ON CONFLICT (frontend_id, name) DO NOTHING;

-- Store packages
CREATE TABLE IF NOT EXISTS public.store_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  frontend_id UUID REFERENCES public.store_frontends(id) ON DELETE SET NULL,
  section_id UUID REFERENCES public.store_package_sections(id) ON DELETE SET NULL,
  service_id INTEGER NOT NULL,
  base_quantity INTEGER NOT NULL DEFAULT 100,
  base_price NUMERIC NOT NULL DEFAULT 0,
  price_per_thousand NUMERIC NOT NULL DEFAULT 0,
  allow_custom_quantity BOOLEAN DEFAULT true,
  min_quantity INTEGER DEFAULT 10,
  max_quantity INTEGER DEFAULT 100000,
  sales_count INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  package_type TEXT NOT NULL DEFAULT 'single',
  combo_items JSONB,
  predefined_quantities JSONB,
  link_tutorial_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  name TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  badge_text TEXT,
  usage_notes TEXT,
  link_label TEXT,
  default_link_fields INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Patch existing installs
DO $$ BEGIN
  ALTER TABLE public.store_packages ADD COLUMN section_id UUID REFERENCES public.store_package_sections(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.store_packages ADD COLUMN package_type TEXT NOT NULL DEFAULT 'single';
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.store_packages ADD COLUMN combo_items JSONB;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.store_packages ADD COLUMN link_tutorial_rules JSONB NOT NULL DEFAULT '[]'::jsonb;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.store_packages ADD COLUMN default_link_fields INTEGER NOT NULL DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_store_packages_section_id ON public.store_packages(section_id);
CREATE INDEX IF NOT EXISTS idx_store_packages_link_tutorial_rules_gin ON public.store_packages USING GIN (link_tutorial_rules);



ALTER TABLE public.store_packages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can manage packages" ON public.store_packages
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can view active packages" ON public.store_packages
  FOR SELECT
  USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_store_packages_updated_at
  BEFORE UPDATE ON public.store_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Store banners (grid acima dos pacotes)
CREATE TABLE IF NOT EXISTS public.store_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  frontend_id UUID NOT NULL REFERENCES public.store_frontends(id) ON DELETE CASCADE,
  title TEXT,
  image_url TEXT NOT NULL,
  target_url TEXT,
  package_id UUID REFERENCES public.store_packages(id) ON DELETE SET NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Patch existing installs
DO $$ BEGIN
  ALTER TABLE public.store_banners ADD COLUMN package_id UUID REFERENCES public.store_packages(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN null; WHEN undefined_table THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.store_banners ADD COLUMN target_url TEXT;
EXCEPTION WHEN duplicate_column THEN null; WHEN undefined_table THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_store_banners_frontend_order ON public.store_banners(frontend_id, display_order);

ALTER TABLE public.store_banners ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public can view active store banners" ON public.store_banners
  FOR SELECT
  USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can view all store banners" ON public.store_banners
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can insert store banners" ON public.store_banners
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update store banners" ON public.store_banners
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can delete store banners" ON public.store_banners
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_store_banners_updated_at
  BEFORE UPDATE ON public.store_banners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Store menu banners (rodapé do menu lateral)
CREATE TABLE IF NOT EXISTS public.store_menu_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  frontend_id UUID NOT NULL REFERENCES public.store_frontends(id) ON DELETE CASCADE,
  title TEXT,
  image_url TEXT NOT NULL,
  target_url TEXT,
  package_id UUID REFERENCES public.store_packages(id) ON DELETE SET NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_menu_banners_frontend_order
ON public.store_menu_banners(frontend_id, display_order);

ALTER TABLE public.store_menu_banners ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public can view active store menu banners" ON public.store_menu_banners
  FOR SELECT
  USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage store menu banners" ON public.store_menu_banners
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_store_menu_banners_updated_at
  BEFORE UPDATE ON public.store_menu_banners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Store orders (public checkout)
CREATE TABLE IF NOT EXISTS public.store_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  frontend_id UUID REFERENCES public.store_frontends(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.store_packages(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL,
  total_price NUMERIC NOT NULL,
  external_order_id INTEGER,
  external_order_ids JSONB,
  order_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  phone TEXT NOT NULL,
  link TEXT NOT NULL,
  payment_id TEXT,
  payment_status TEXT DEFAULT 'pending',
  order_status TEXT DEFAULT 'pending',
  service_name TEXT,
  start_count TEXT,
  remains TEXT
);

-- Patch existing installs
DO $$ BEGIN
  ALTER TABLE public.store_orders ADD COLUMN external_order_ids JSONB;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.store_orders ADD COLUMN order_payload JSONB;
EXCEPTION WHEN duplicate_column THEN null; END $$;

ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can manage all store orders" ON public.store_orders
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can insert store orders" ON public.store_orders
  FOR INSERT
  WITH CHECK (
    phone IS NOT NULL
    AND length(trim(phone)) > 0
    AND COALESCE(payment_status, 'pending') = 'pending'
    AND COALESCE(order_status, 'pending') = 'pending'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can update pending orders" ON public.store_orders
  FOR UPDATE
  USING (COALESCE(payment_status, 'pending') = 'pending')
  WITH CHECK (COALESCE(payment_status, 'pending') = 'pending');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can view orders by phone" ON public.store_orders
  FOR SELECT
  USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_store_orders_updated_at
  BEFORE UPDATE ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- STORE PAYMENT INTENTS (kept even if pending orders are deleted)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.store_payment_intents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id TEXT NOT NULL,
  order_id UUID,
  phone TEXT NOT NULL,
  package_id UUID NOT NULL REFERENCES public.store_packages(id) ON DELETE RESTRICT,
  total_price NUMERIC NOT NULL DEFAULT 0,
  payment_provider TEXT NOT NULL DEFAULT 'mercadopago',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique key for reconciliation (idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_payment_intents_payment_id
  ON public.store_payment_intents(payment_id);

CREATE INDEX IF NOT EXISTS idx_store_payment_intents_phone_created_at
  ON public.store_payment_intents(phone, created_at DESC);

ALTER TABLE public.store_payment_intents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can manage store_payment_intents" ON public.store_payment_intents
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can manage store_payment_intents" ON public.store_payment_intents
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_store_payment_intents_updated_at
  BEFORE UPDATE ON public.store_payment_intents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- STORE PACKAGE CREDITS (BRL credit per phone+package)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.store_package_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  package_id UUID NOT NULL REFERENCES public.store_packages(id) ON DELETE RESTRICT,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL DEFAULT 'available',
  source_payment_id TEXT NOT NULL,
  source_order_id UUID,
  redeemed_order_id UUID,
  redeemed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Idempotency: one credit per late-approved payment
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_package_credits_source_payment_id
  ON public.store_package_credits(source_payment_id);

CREATE INDEX IF NOT EXISTS idx_store_package_credits_phone_pkg_status
  ON public.store_package_credits(phone, package_id, status);

ALTER TABLE public.store_package_credits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can manage store_package_credits" ON public.store_package_credits
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can manage store_package_credits" ON public.store_package_credits
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_store_package_credits_updated_at
  BEFORE UPDATE ON public.store_package_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Store order links (duplicate-prevention index)
CREATE TABLE IF NOT EXISTS public.store_order_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.store_orders(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL,
  normalized_link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_order_links_service_link_status
  ON public.store_order_links(service_id, normalized_link, status);

CREATE INDEX IF NOT EXISTS idx_store_order_links_order_id
  ON public.store_order_links(order_id);

ALTER TABLE public.store_order_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can manage store_order_links" ON public.store_order_links
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_store_order_links_updated_at
  BEFORE UPDATE ON public.store_order_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE OR REPLACE FUNCTION public._normalize_order_link(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(regexp_replace(regexp_replace(coalesce(trim(input), ''), '\\s+', '', 'g'), '/+$', ''))
$$;

CREATE OR REPLACE FUNCTION public.refresh_store_order_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  payload jsonb;
  payload_type text;
  st text;
  it jsonb;
  l text;
  sid int;
BEGIN
  DELETE FROM public.store_order_links WHERE order_id = NEW.id;

  payload := COALESCE(NEW.order_payload, '{}'::jsonb);
  payload_type := lower(COALESCE(payload->>'type', 'single'));
  st := lower(trim(COALESCE(NEW.order_status, 'pending')));

  IF payload_type = 'combo' THEN
    IF jsonb_typeof(payload->'items') = 'array' THEN
      FOR it IN SELECT value FROM jsonb_array_elements(payload->'items') LOOP
        sid := NULLIF((it->>'service_id')::int, 0);
        IF sid IS NULL THEN CONTINUE; END IF;

        IF jsonb_typeof(it->'links') = 'array' THEN
          FOR l IN SELECT jsonb_array_elements_text(it->'links') LOOP
            IF public._normalize_order_link(l) <> '' THEN
              INSERT INTO public.store_order_links(order_id, service_id, normalized_link, status)
              VALUES (NEW.id, sid, public._normalize_order_link(l), st);
            END IF;
          END LOOP;
        END IF;
      END LOOP;
    END IF;
  ELSE
    sid := NULLIF((SELECT service_id FROM public.store_packages WHERE id = NEW.package_id LIMIT 1), 0);
    IF sid IS NULL THEN RETURN NEW; END IF;

    IF jsonb_typeof(payload->'links') = 'array' THEN
      FOR l IN SELECT jsonb_array_elements_text(payload->'links') LOOP
        IF public._normalize_order_link(l) <> '' THEN
          INSERT INTO public.store_order_links(order_id, service_id, normalized_link, status)
          VALUES (NEW.id, sid, public._normalize_order_link(l), st);
        END IF;
      END LOOP;
    ELSE
      IF public._normalize_order_link(NEW.link) <> '' THEN
        INSERT INTO public.store_order_links(order_id, service_id, normalized_link, status)
        VALUES (NEW.id, sid, public._normalize_order_link(NEW.link), st);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_store_order_links ON public.store_orders;
CREATE TRIGGER trg_refresh_store_order_links
AFTER INSERT OR UPDATE OF order_status, order_payload, package_id, link
ON public.store_orders
FOR EACH ROW
EXECUTE FUNCTION public.refresh_store_order_links();
-- Keep per-link statuses in sync when the main order reaches a terminal state
CREATE OR REPLACE FUNCTION public.sync_store_order_external_statuses()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  terminal boolean;
BEGIN
  terminal := lower(trim(coalesce(NEW.order_status, ''))) IN ('completed','cancelled','canceled','error','failed');

  IF terminal
     AND NEW.external_order_ids IS NOT NULL
     AND jsonb_typeof(NEW.external_order_ids) = 'array'
  THEN
    NEW.external_order_ids := (
      SELECT jsonb_agg(
        CASE
          WHEN jsonb_typeof(elem) = 'object' THEN
            jsonb_set(elem, '{order_status}', to_jsonb(NEW.order_status), true)
          ELSE
            elem
        END
      )
      FROM jsonb_array_elements(NEW.external_order_ids) AS elem
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_store_order_external_statuses ON public.store_orders;
CREATE TRIGGER trg_sync_store_order_external_statuses
BEFORE UPDATE OF order_status ON public.store_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_store_order_external_statuses();

-- Function to increment package sales count
CREATE OR REPLACE FUNCTION public.increment_package_sales(package_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE store_packages
  SET sales_count = sales_count + 1
  WHERE id = package_id;
END;
$$;

-- =====================================================
-- TICKET MESSAGES (chat)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sender_type TEXT NOT NULL,
  message TEXT NOT NULL
);

ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can send support messages" ON public.ticket_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'::app_role
    )
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can view all messages" ON public.ticket_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'::app_role
    )
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert messages" ON public.ticket_messages
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can send messages to their tickets" ON public.ticket_messages
  FOR INSERT
  WITH CHECK (
    sender_type = 'user'
    AND EXISTS (
      SELECT 1 FROM public.support_tickets
      WHERE support_tickets.id = ticket_messages.ticket_id
        AND support_tickets.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view messages from their tickets" ON public.ticket_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets
      WHERE support_tickets.id = ticket_messages.ticket_id
        AND support_tickets.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- =====================================================
-- EXTERNAL DATABASE CONFIGS (white-label convenience)
-- =====================================================
-- Stores last used external DB URL + anon key for admins.
-- Service role key is NOT stored here.
CREATE TABLE IF NOT EXISTS public.external_database_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  url text NOT NULL,
  anon_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.external_database_configs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can manage external db configs" ON public.external_database_configs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_external_database_configs_updated_at
  BEFORE UPDATE ON public.external_database_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_external_database_configs_user_id ON public.external_database_configs(user_id);


-- =====================================================
-- STORAGE BUCKETS (Apenas criação - políticas devem ser configuradas via dashboard)
-- =====================================================

-- NOTA: Políticas de storage.objects não podem ser criadas via SQL
-- pois requerem propriedade da tabela (que pertence ao Supabase)
-- Os buckets devem ser configurados manualmente no dashboard do Supabase:
-- 1. Vá para Storage no painel do Supabase
-- 2. Crie os buckets 'site-assets' e 'category-icons' como públicos
-- 3. Configure as políticas RLS conforme necessário

-- Tentativa de criar buckets (pode falhar em alguns ambientes)
DO $$ BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('site-assets', 'site-assets', true)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN insufficient_privilege THEN 
  RAISE NOTICE 'Não foi possível criar bucket site-assets - configure manualmente no dashboard';
END $$;

DO $$ BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('category-icons', 'category-icons', true)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN insufficient_privilege THEN 
  RAISE NOTICE 'Não foi possível criar bucket category-icons - configure manualmente no dashboard';
END $$;

-- =====================================================
-- REALTIME CONFIGURATION
-- =====================================================
-- Habilita atualizações em tempo real para telas que monitoram pedidos e suporte.
-- Nota: esse comando pode falhar caso a tabela já esteja na publicação; por isso tratamos erros.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.store_orders;
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN OTHERS THEN RAISE NOTICE 'Realtime: não foi possível adicionar store_orders (%).', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN OTHERS THEN RAISE NOTICE 'Realtime: não foi possível adicionar support_tickets (%).', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN OTHERS THEN RAISE NOTICE 'Realtime: não foi possível adicionar ticket_messages (%).', SQLERRM;
END $$;

-- =====================================================
-- SCHEMA SETUP COMPLETE
-- O primeiro usuário cadastrado será automaticamente ADMIN
-- =====================================================
`;

export const TABLES_LIST = [
  'profiles',
  'user_roles',
  'smm_providers',
  'imported_services',
  'service_customizations',
  'category_display_order',
  'orders',
  'refills',
  'balance_history',
  'support_tickets',
  'ticket_messages',
  'platform_icons',
  'platform_category_links',
  'category_icons',
  'landing_content',
  'site_settings',
  'terms_content',
  'privacy_content',
  'ai_providers',
  'ai_agents',
  'seo_actions',
  'api_keys',
  'favorite_services',
  'store_frontends',
  'store_package_sections',
  'store_packages',
  'store_banners',
  'store_menu_banners',
  'store_orders',
  'store_customers',
  'store_customer_sessions',
  'store_customer_credits',
  'external_database_configs',
];

// Tables that are preserved during cleanup (admin can edit manually)
export const PRESERVED_TABLES = [
  'landing_content',
  'site_settings', 
  'terms_content',
  'privacy_content',
  'ai_providers',
  'ai_agents',
  'seo_actions',
];
