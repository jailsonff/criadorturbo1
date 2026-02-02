-- Add balance and phone columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS phone text;

-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'));