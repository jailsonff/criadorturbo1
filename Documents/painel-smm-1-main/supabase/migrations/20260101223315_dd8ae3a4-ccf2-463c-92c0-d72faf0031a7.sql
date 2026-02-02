-- Create balance_history table to track approved balance recharges
CREATE TABLE public.balance_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'pix',
  payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.balance_history ENABLE ROW LEVEL SECURITY;

-- Users can view their own balance history
CREATE POLICY "Users can view their own balance history"
ON public.balance_history
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own balance history (when payment is approved)
CREATE POLICY "Users can insert their own balance history"
ON public.balance_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view all balance history
CREATE POLICY "Admins can view all balance history"
ON public.balance_history
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Create index for faster user queries
CREATE INDEX idx_balance_history_user_id ON public.balance_history(user_id);
CREATE INDEX idx_balance_history_created_at ON public.balance_history(created_at DESC);