import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { getExternalConfig, getSupabaseClient } from "@/lib/supabaseClient";
import { setCurrentUserId, clearUserLocalData } from "@/lib/api";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone: string
  ) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>;
  resendSignupEmail: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

function getClientKey() {
  const cfg = getExternalConfig();
  return cfg ? `${cfg.url}:${cfg.anonKey}` : "default";
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [clientKey, setClientKey] = useState<string>(() => getClientKey());

  // Keep auth context in sync when the app switches between default/external database
  useEffect(() => {
    const onChange = () => setClientKey(getClientKey());

    // Cross-tab updates
    window.addEventListener("storage", onChange);
    // Same-tab updates (we dispatch this from supabaseClient helpers)
    window.addEventListener("supabase-config-changed", onChange as EventListener);

    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("supabase-config-changed", onChange as EventListener);
    };
  }, []);

  const checkAdminRole = async (userId: string) => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (error) {
        console.error("Error checking admin role:", error);
        setIsAdmin(false);
        return;
      }

      setIsAdmin(!!data);
    } catch (err) {
      console.error("Error in checkAdminRole:", err);
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    setLoading(true);

    const supabase = getSupabaseClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        setCurrentUserId(session.user.id);
        setTimeout(() => {
          checkAdminRole(session.user.id);
        }, 0);
      } else {
        clearUserLocalData();
        setIsAdmin(false);
      }

      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        setCurrentUserId(session.user.id);
        checkAdminRole(session.user.id);
      } else {
        setIsAdmin(false);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [clientKey]);

  const signIn = async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    phone: string
  ) => {
    const supabase = getSupabaseClient();
    const redirectUrl = `${window.location.origin}/`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          phone: phone,
        },
      },
    });

    const needsEmailConfirmation = !!data?.user && !data?.session;

    return {
      error: error as Error | null,
      needsEmailConfirmation,
    };
  };

  const resendSignupEmail = async (email: string) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    return { error: error as Error | null };
  };

  const signOut = async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  };

  const value = useMemo(
    () => ({ user, session, loading, isAdmin, signIn, signUp, resendSignupEmail, signOut }),
    [user, session, loading, isAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
