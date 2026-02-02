
-- Tabela para gerenciar os frontends
CREATE TABLE public.store_frontends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  cta_title TEXT DEFAULT 'Quer ENGAJAMENTO?',
  cta_subtitle TEXT DEFAULT 'Escolha os pacotes desejados',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para os pacotes/cards da loja
CREATE TABLE public.store_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  frontend_id UUID REFERENCES public.store_frontends(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
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
  badge_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para pedidos da loja (sem login, apenas telefone)
CREATE TABLE public.store_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  frontend_id UUID REFERENCES public.store_frontends(id),
  package_id UUID REFERENCES public.store_packages(id),
  phone TEXT NOT NULL,
  link TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  total_price NUMERIC NOT NULL,
  payment_id TEXT,
  payment_status TEXT DEFAULT 'pending',
  order_status TEXT DEFAULT 'pending',
  external_order_id INTEGER,
  service_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.store_frontends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;

-- Políticas para store_frontends
CREATE POLICY "Anyone can view active frontends" ON public.store_frontends
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage frontends" ON public.store_frontends
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Políticas para store_packages
CREATE POLICY "Anyone can view active packages" ON public.store_packages
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage packages" ON public.store_packages
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Políticas para store_orders (qualquer um pode inserir, consultar por telefone)
CREATE POLICY "Anyone can insert store orders" ON public.store_orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view orders by phone" ON public.store_orders
  FOR SELECT USING (true);

CREATE POLICY "Anyone can update pending orders" ON public.store_orders
  FOR UPDATE USING (payment_status = 'pending');

CREATE POLICY "Admins can manage all store orders" ON public.store_orders
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger para updated_at
CREATE TRIGGER update_store_frontends_updated_at
  BEFORE UPDATE ON public.store_frontends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_store_packages_updated_at
  BEFORE UPDATE ON public.store_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_store_orders_updated_at
  BEFORE UPDATE ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir frontend padrão
INSERT INTO public.store_frontends (name, slug, cta_title, cta_subtitle)
VALUES ('Loja Principal', 'loja', 'Quer ENGAJAMENTO?', 'Escolha os pacotes desejados e impulsione suas redes sociais!');
