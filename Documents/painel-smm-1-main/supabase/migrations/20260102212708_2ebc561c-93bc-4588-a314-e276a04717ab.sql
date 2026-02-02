-- Create ticket_messages table for chat-style conversation
CREATE TABLE public.ticket_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'support')),
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_ticket_messages_ticket_id ON public.ticket_messages(ticket_id);
CREATE INDEX idx_ticket_messages_created_at ON public.ticket_messages(created_at);

-- Enable RLS
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages from their own tickets
CREATE POLICY "Users can view messages from their tickets"
ON public.ticket_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets
    WHERE support_tickets.id = ticket_messages.ticket_id
    AND support_tickets.user_id = auth.uid()
  )
);

-- Users can insert messages to their own tickets
CREATE POLICY "Users can send messages to their tickets"
ON public.ticket_messages
FOR INSERT
WITH CHECK (
  sender_type = 'user' AND
  EXISTS (
    SELECT 1 FROM public.support_tickets
    WHERE support_tickets.id = ticket_messages.ticket_id
    AND support_tickets.user_id = auth.uid()
  )
);

-- Admins can view all messages
CREATE POLICY "Admins can view all messages"
ON public.ticket_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Admins can insert support messages
CREATE POLICY "Admins can send support messages"
ON public.ticket_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Service role can insert messages (for AI)
CREATE POLICY "Service role can insert messages"
ON public.ticket_messages
FOR INSERT
WITH CHECK (true);

-- Enable realtime for ticket messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;