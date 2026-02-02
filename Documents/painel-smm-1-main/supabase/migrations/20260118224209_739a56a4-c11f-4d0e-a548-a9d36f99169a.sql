-- Fix overly-permissive RLS policies flagged by linter

-- 1) service_customizations: restrict writes to admins, allow public read (active only)
ALTER TABLE public.service_customizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on service_customizations" ON public.service_customizations;

CREATE POLICY "Anyone can view active service_customizations"
ON public.service_customizations
FOR SELECT
USING (COALESCE(is_active, true) = true);

CREATE POLICY "Admins can manage service_customizations"
ON public.service_customizations
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) store_orders: keep public checkout but avoid always-true WITH CHECK/USING
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert store orders" ON public.store_orders;
CREATE POLICY "Anyone can insert store orders"
ON public.store_orders
FOR INSERT
WITH CHECK (
  phone IS NOT NULL
  AND length(trim(phone)) > 0
  AND COALESCE(payment_status, 'pending') = 'pending'
  AND COALESCE(order_status, 'pending') = 'pending'
);

DROP POLICY IF EXISTS "Anyone can update pending orders" ON public.store_orders;
CREATE POLICY "Anyone can update pending orders"
ON public.store_orders
FOR UPDATE
USING (COALESCE(payment_status, 'pending') = 'pending')
WITH CHECK (COALESCE(payment_status, 'pending') = 'pending');

-- 3) ticket_messages: replace always-true service-role policy with explicit service_role check
DROP POLICY IF EXISTS "Service role can insert messages" ON public.ticket_messages;
CREATE POLICY "Service role can insert messages"
ON public.ticket_messages
FOR INSERT
WITH CHECK (auth.role() = 'service_role');
