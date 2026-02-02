-- Fix RLS for store_frontends: ensure INSERT has WITH CHECK
ALTER TABLE public.store_frontends ENABLE ROW LEVEL SECURITY;

-- Recreate admin policies with explicit WITH CHECK for INSERT/UPDATE
DROP POLICY IF EXISTS "Admins can manage frontends" ON public.store_frontends;

CREATE POLICY "Admins can select store_frontends"
ON public.store_frontends
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert store_frontends"
ON public.store_frontends
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update store_frontends"
ON public.store_frontends
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete store_frontends"
ON public.store_frontends
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Keep public select of active frontends
DROP POLICY IF EXISTS "Anyone can view active frontends" ON public.store_frontends;
CREATE POLICY "Anyone can view active frontends"
ON public.store_frontends
FOR SELECT
USING (is_active = true);
