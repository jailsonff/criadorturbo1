-- Create table for terms content
CREATE TABLE public.terms_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Termos de Serviço',
  content text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.terms_content ENABLE ROW LEVEL SECURITY;

-- Anyone can read terms
CREATE POLICY "Anyone can view terms"
ON public.terms_content
FOR SELECT
USING (true);

-- Only admins can update terms
CREATE POLICY "Admins can update terms"
ON public.terms_content
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert terms
CREATE POLICY "Admins can insert terms"
ON public.terms_content
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default content
INSERT INTO public.terms_content (title, content) VALUES (
  'Termos de Serviço',
  '## 1. Aceitação dos Termos

Ao acessar e usar nossos serviços, você concorda em cumprir estes Termos de Serviço.

## 2. Descrição dos Serviços

Oferecemos serviços de marketing digital para redes sociais, incluindo seguidores, curtidas, visualizações e engajamento.

## 3. Uso Aceitável

Você concorda em usar nossos serviços apenas para fins legais e de acordo com estes termos.

## 4. Pagamentos e Reembolsos

Todos os pagamentos são processados de forma segura. Reembolsos podem ser solicitados em casos específicos.

## 5. Limitação de Responsabilidade

Não nos responsabilizamos por alterações em políticas de terceiros que possam afetar os serviços.

## 6. Alterações nos Termos

Reservamo-nos o direito de modificar estes termos a qualquer momento.

## 7. Contato

Para dúvidas, entre em contato através do nosso suporte.'
);