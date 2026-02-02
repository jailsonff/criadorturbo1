-- Allow admins to update refills
CREATE POLICY "Admins can update all refills"
ON public.refills
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));