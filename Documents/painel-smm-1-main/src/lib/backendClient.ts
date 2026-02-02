// Backend (Lovable Cloud) client
//
// This client always points to the built-in backend of this app. It is used ONLY for
// calling backend functions (functions.invoke) that are deployed there.
//
// IMPORTANT: Do NOT use this client for database reads/writes when the project is
// configured to use an external database. For DB access, use getSupabaseClient().

import { supabase as backendSupabase } from "@/integrations/supabase/client";

export { backendSupabase };
