-- Create table for landing page content
CREATE TABLE public.landing_content (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Header
  site_name text NOT NULL DEFAULT 'UpMidias',
  
  -- Hero Section
  hero_badge_text text NOT NULL DEFAULT 'Sistema Online • +10.000 pedidos entregues',
  hero_title_line1 text NOT NULL DEFAULT 'Impulsione suas',
  hero_title_highlight text NOT NULL DEFAULT 'Redes Sociais',
  hero_subtitle text NOT NULL DEFAULT 'A melhor plataforma SMM do Brasil. Aumente seguidores, curtidas, visualizações e muito mais com entrega automática e instantânea.',
  hero_button_primary text NOT NULL DEFAULT 'Acessar Painel',
  hero_button_secondary text NOT NULL DEFAULT 'Criar Conta',
  
  -- Features Section
  features_title text NOT NULL DEFAULT 'Por que escolher a',
  features_title_highlight text NOT NULL DEFAULT 'UpMidias',
  features_subtitle text NOT NULL DEFAULT 'Oferecemos os melhores serviços de SMM com qualidade garantida',
  
  -- Feature 1
  feature1_icon text NOT NULL DEFAULT 'Zap',
  feature1_title text NOT NULL DEFAULT 'Entrega Instantânea',
  feature1_description text NOT NULL DEFAULT 'Seus pedidos são processados e entregues em tempo recorde.',
  
  -- Feature 2
  feature2_icon text NOT NULL DEFAULT 'Shield',
  feature2_title text NOT NULL DEFAULT '100% Seguro',
  feature2_description text NOT NULL DEFAULT 'Garantimos a segurança das suas contas e dados.',
  
  -- Feature 3
  feature3_icon text NOT NULL DEFAULT 'Clock',
  feature3_title text NOT NULL DEFAULT 'Suporte 24/7',
  feature3_description text NOT NULL DEFAULT 'Nossa equipe está sempre disponível para ajudar.',
  
  -- Feature 4
  feature4_icon text NOT NULL DEFAULT 'TrendingUp',
  feature4_title text NOT NULL DEFAULT 'Melhor Preço',
  feature4_description text NOT NULL DEFAULT 'Os melhores serviços com os menores preços do mercado.',
  
  -- CTA Section
  cta_title text NOT NULL DEFAULT 'Pronto para começar?',
  cta_subtitle text NOT NULL DEFAULT 'Crie sua conta gratuitamente e comece a impulsionar suas redes sociais agora mesmo.',
  cta_button_text text NOT NULL DEFAULT 'Criar Conta Grátis',
  
  -- Footer
  footer_copyright text NOT NULL DEFAULT '© 2024 UpMidias. Todos os direitos reservados.',
  
  -- Metadata
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.landing_content ENABLE ROW LEVEL SECURITY;

-- Anyone can view
CREATE POLICY "Anyone can view landing content"
ON public.landing_content
FOR SELECT
USING (true);

-- Only admins can update
CREATE POLICY "Admins can update landing content"
ON public.landing_content
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert
CREATE POLICY "Admins can insert landing content"
ON public.landing_content
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Insert default content
INSERT INTO public.landing_content (id) VALUES (gen_random_uuid());