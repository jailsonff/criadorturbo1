-- Create table for privacy content
CREATE TABLE public.privacy_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Política de Privacidade',
  content text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.privacy_content ENABLE ROW LEVEL SECURITY;

-- Anyone can read privacy policy
CREATE POLICY "Anyone can view privacy"
ON public.privacy_content
FOR SELECT
USING (true);

-- Only admins can update privacy
CREATE POLICY "Admins can update privacy"
ON public.privacy_content
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert privacy
CREATE POLICY "Admins can insert privacy"
ON public.privacy_content
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default content
INSERT INTO public.privacy_content (title, content) VALUES (
  'Política de Privacidade',
  '## 1. Informações que Coletamos

Coletamos as seguintes informações quando você utiliza nossos serviços:
- Informações de conta (e-mail, nome de usuário)
- Dados de transação (pedidos, pagamentos)
- Informações técnicas (IP, navegador, dispositivo)
- Links de redes sociais fornecidos para pedidos

## 2. Como Usamos suas Informações

Utilizamos suas informações para:
- Processar e entregar seus pedidos
- Fornecer suporte ao cliente
- Melhorar nossos serviços
- Prevenir fraudes e abusos
- Cumprir obrigações legais

## 3. Segurança dos Dados

Implementamos medidas de segurança técnicas e organizacionais para proteger suas informações pessoais contra acesso não autorizado, alteração, divulgação ou destruição.

## 4. Compartilhamento de Informações

Não vendemos suas informações pessoais. Podemos compartilhar dados apenas:
- Com prestadores de serviços que nos auxiliam nas operações
- Quando exigido por lei ou ordem judicial
- Para proteger nossos direitos e segurança

## 5. Cookies e Tecnologias Similares

Utilizamos cookies e tecnologias similares para melhorar sua experiência e analisar o uso do site.

## 6. Seus Direitos

Você tem o direito de:
- Acessar seus dados pessoais
- Corrigir informações incorretas
- Solicitar a exclusão de seus dados
- Retirar seu consentimento a qualquer momento

## 7. Contato

Para questões sobre privacidade, entre em contato: privacidade@upmidias.com'
);