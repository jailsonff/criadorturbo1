import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Database, CheckCircle2, XCircle, Loader2, AlertTriangle, Eye, EyeOff, Copy, Download, RefreshCw, Info, Trash2, ShieldAlert, UserPlus, Upload, HardDrive, FileJson } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient, hasExternalDatabase, setExternalConfig } from "@/lib/supabaseClient";
import { backendSupabase } from "@/lib/backendClient";
import { DATABASE_SCHEMA, TABLES_LIST } from "@/lib/databaseSchema";
import { TABLE_REGISTRY } from "@/lib/schemaSync";
import { removeApiKey } from "@/lib/api";
import { getSafeLocalStorage, safeGetItem, safeRemoveItem } from "@/lib/safeStorage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface DatabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

interface TableStatus {
  name: string;
  exists: boolean;
}

const AdminDatabase = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [config, setConfig] = useState<DatabaseConfig>({
    url: "",
    anonKey: "",
    serviceRoleKey: "",
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isClearingAdmin, setIsClearingAdmin] = useState(false);
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCheckingExternalSchema, setIsCheckingExternalSchema] = useState(false);
  const [externalSchemaPatch, setExternalSchemaPatch] = useState<string>("");
  const [showExternalSchemaDialog, setShowExternalSchemaDialog] = useState(false);
  const [tableStatuses, setTableStatuses] = useState<TableStatus[]>([]);
  const [showServiceKey, setShowServiceKey] = useState(false);
  const [showAnonKey, setShowAnonKey] = useState(false);

  // Load saved config on mount
  useEffect(() => {
    // Guard: warn if the white-label registry and SQL table list are out of sync
    try {
      const listSet = new Set(TABLES_LIST);
      const regSet = new Set(TABLE_REGISTRY.map((t) => t.name));
      const missingInList = [...regSet].filter((t) => !listSet.has(t));
      const missingInRegistry = [...listSet].filter((t) => !regSet.has(t));

      if (missingInList.length || missingInRegistry.length) {
        console.warn("White-label schema is out of sync", { missingInList, missingInRegistry });
        toast({
          title: "Atenção: script desatualizado",
          description:
            "Existe divergência entre as tabelas registradas e o script SQL. Abra 'Copiar Script SQL' e revise/atualize antes de usar em banco externo.",
          variant: "destructive",
        });
      }
    } catch (e) {
      console.warn("Could not validate schema sync", e);
    }

    const savedConfig = safeGetItem("supabase_config");
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig(parsed);
        // Auto-test connection if config exists
        testConnectionWithConfig(parsed);
      } catch (e) {
        console.error("Error parsing saved config:", e);
      }
    }
  }, []);

  // Also keep a server-side backup of the external DB config.
  // This prevents losing the connection if the browser clears localStorage.
  useEffect(() => {
    const restoreFromBackend = async () => {
      if (!user) return;

      // Only attempt restore if localStorage doesn't already have it
      if (safeGetItem("supabase_config")) return;

      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from("external_database_configs")
          .select("url, anon_key")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) return;
        if (!data?.url || !data?.anon_key) return;

        const restored = {
          url: data.url,
          anonKey: data.anon_key,
          serviceRoleKey: "",
        } as DatabaseConfig;

        // Persist back into localStorage and refresh the dynamic client
        setExternalConfig({ url: restored.url, anonKey: restored.anonKey });
        setConfig(restored);
        testConnectionWithConfig(restored);

        toast({
          title: "Banco externo restaurado",
          description: "Reconectamos automaticamente usando a última configuração salva.",
        });
      } catch (e) {
        console.warn("Could not restore external DB config", e);
      }
    };

    restoreFromBackend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const testConnectionWithConfig = async (testConfig: DatabaseConfig) => {
    if (!testConfig.url || !testConfig.anonKey) {
      return;
    }

    setIsTesting(true);
    try {
      const client = createClient(testConfig.url, testConfig.anonKey);
      
      // Try a simple query to test connection
      const { error } = await client.from("profiles").select("count", { count: "exact", head: true });
      
      if (error && error.code !== "PGRST116" && error.code !== "42P01") {
        // PGRST116 = no rows, 42P01 = table doesn't exist - both are OK for connection test
        throw error;
      }

      setIsConnected(true);
      
      // Check which tables exist
      await checkTablesExist(client);
      
      toast({
        title: "Conexão estabelecida",
        description: "Conectado ao banco de dados com sucesso!",
      });
    } catch (error: any) {
      setIsConnected(false);
      setTableStatuses([]);
      toast({
        title: "Erro na conexão",
        description: error.message || "Não foi possível conectar ao banco de dados.",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const checkTablesExist = async (client: any) => {
    const statuses: TableStatus[] = [];
    
    for (const tableName of TABLES_LIST) {
      try {
        const { error } = await client.from(tableName).select("count", { count: "exact", head: true });
        statuses.push({
          name: tableName,
          exists: !error || error.code === "PGRST116", // No rows is OK
        });
      } catch {
        statuses.push({ name: tableName, exists: false });
      }
    }
    
    setTableStatuses(statuses);
  };

  const persistExternalConfigToBackend = async (cfg: DatabaseConfig) => {
    if (!user?.id || !cfg.url || !cfg.anonKey) return;

    try {
      const supabase = getSupabaseClient();
      await supabase.from("external_database_configs").upsert(
        {
          user_id: user.id,
          url: cfg.url,
          anon_key: cfg.anonKey,
        },
        { onConflict: "user_id" },
      );
    } catch (e) {
      // Non-blocking: localStorage is still the primary store.
      console.warn("Could not persist external DB config to backend", e);
    }
  };

  const testConnection = async () => {
    await testConnectionWithConfig(config);

    // Persist locally (keeps the app connected across reloads)
    if (config.url && config.anonKey) {
      setExternalConfig({ url: config.url, anonKey: config.anonKey, serviceRoleKey: config.serviceRoleKey });
      await persistExternalConfigToBackend(config);
    }
  };

  const saveConfig = async () => {
    if (!config.url || !config.anonKey) return;

    setExternalConfig({ url: config.url, anonKey: config.anonKey, serviceRoleKey: config.serviceRoleKey });
    await persistExternalConfigToBackend(config);

    toast({
      title: "Configuração salva",
      description: "As credenciais foram salvas e permanecerão conectadas até você alterar.",
    });
  };

  const configureDatabase = async () => {
    if (!config.url || !config.serviceRoleKey) {
      toast({
        title: "Credenciais incompletas",
        description: "URL e Service Role Key são necessários para configurar o banco.",
        variant: "destructive",
      });
      return;
    }

    setIsConfiguring(true);
    try {
      // Always call backend function from Lovable Cloud (even when using external DB)
      const { data, error: funcError } = await backendSupabase.functions.invoke("setup-database", {
        body: {
          externalUrl: config.url,
          serviceRoleKey: config.serviceRoleKey,
          schema: DATABASE_SCHEMA,
        },
      });

      if (funcError) {
        console.error("Edge function error:", funcError);
        throw new Error(funcError.message);
      }

      if (data?.requiresManualSetup) {
        // Show instructions for manual setup
        toast({
          title: "Configuração Manual Necessária",
          description: "O Supabase não permite execução automática de SQL. Use o botão 'Copiar Script SQL' e execute manualmente.",
          variant: "default",
        });
        return;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Falha na configuração");
      }

      // Save config and refresh table statuses
      await saveConfig();
      await testConnectionWithConfig(config);

      toast({
        title: "Banco configurado!",
        description: "Todas as tabelas foram criadas com sucesso.",
      });
    } catch (error: any) {
      console.error("Error configuring database:", error);
      
      // Always show the manual setup message for clarity
      toast({
        title: "Use a Configuração Manual",
        description: "Copie o Script SQL e execute no SQL Editor do Supabase Dashboard do seu projeto.",
        variant: "default",
      });
    } finally {
      setIsConfiguring(false);
    }
  };

  const copySchemaToClipboard = () => {
    navigator.clipboard.writeText(DATABASE_SCHEMA);
    toast({
      title: "Script copiado!",
      description: "Cole no SQL Editor do Supabase Dashboard.",
    });
  };

  const downloadSchema = () => {
    const blob = new Blob([DATABASE_SCHEMA], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "smm_panel_schema.sql";
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Script baixado!",
      description: "Arquivo smm_panel_schema.sql salvo.",
    });
  };

const EXTERNAL_SCHEMA_PATCHES = [
    {
      id: "store_landing_cols",
      title: "Landing da loja (site_settings)",
      check: async (client: any) => {
        const { error } = await client
          .from("site_settings")
          .select("use_store_landing, store_landing_slug")
          .limit(1);
        return Boolean(error && (error.code === "42703" || String(error.message || "").includes("does not exist")));
      },
      sql: [
        "-- Add store landing control columns",
        "ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS use_store_landing boolean DEFAULT false;",
        "ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS store_landing_slug text DEFAULT 'loja';",
      ].join("\n"),
    },
    {
      id: "contact_section_cols",
      title: "Contato/Instagram (site_settings)",
      check: async (client: any) => {
        const { error } = await client
          .from("site_settings")
          .select("contact_section_title, instagram_handle")
          .limit(1);
        return Boolean(error && (error.code === "42703" || String(error.message || "").includes("does not exist")));
      },
      sql: [
        "-- Add contact/instagram columns",
        "ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS contact_section_title text DEFAULT 'Fale com a Agência Recife';",
        "ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS instagram_handle text DEFAULT '@agenciarecife_';",
      ].join("\n"),
    },
    {
      id: "package_link_label",
      title: "Rótulo do Link (store_packages)",
      check: async (client: any) => {
        const { error } = await client.from("store_packages").select("link_label").limit(1);
        return Boolean(error && (error.code === "42703" || String(error.message || "").includes("does not exist")));
      },
      sql: [
        "-- Add customizable label for the purchase link field",
        "ALTER TABLE public.store_packages ADD COLUMN IF NOT EXISTS link_label text;",
      ].join("\n"),
    },
    {
      id: "store_tables",
      title: "Tabelas da Store (store_frontends, store_packages, store_orders)",
      check: async (client: any) => {
        const { error } = await client.from("store_frontends").select("id").limit(1);
        return Boolean(error && (error.code === "42P01" || String(error.message || "").includes("does not exist")));
      },
       sql: [
         "-- Create store_frontends table",
         "CREATE TABLE IF NOT EXISTS public.store_frontends (",
         "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),",
         "  name TEXT NOT NULL,",
         "  slug TEXT NOT NULL UNIQUE,",
         "  cta_title TEXT DEFAULT 'Quer ENGAJAMENTO?',",
         "  cta_subtitle TEXT DEFAULT 'Escolha os pacotes desejados',",
         "  is_active BOOLEAN DEFAULT true,",
         "  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),",
         "  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()",
         ");",
         "",
         "ALTER TABLE public.store_frontends ENABLE ROW LEVEL SECURITY;",
         "",
         "CREATE POLICY \"Anyone can view active frontends\" ON public.store_frontends FOR SELECT USING (is_active = true);",
         "CREATE POLICY \"Admins can select store_frontends\" ON public.store_frontends FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));",
         "CREATE POLICY \"Admins can insert store_frontends\" ON public.store_frontends FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));",
         "CREATE POLICY \"Admins can update store_frontends\" ON public.store_frontends FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));",
         "CREATE POLICY \"Admins can delete store_frontends\" ON public.store_frontends FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));",
         "",
         "-- Create store_packages table",
         "CREATE TABLE IF NOT EXISTS public.store_packages (",
         "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),",
         "  frontend_id UUID REFERENCES public.store_frontends(id) ON DELETE SET NULL,",
         "  name TEXT NOT NULL,",
         "  description TEXT,",
         "  service_id INTEGER NOT NULL,",
         "  base_quantity INTEGER NOT NULL DEFAULT 100,",
         "  base_price NUMERIC NOT NULL DEFAULT 0,",
         "  price_per_thousand NUMERIC NOT NULL DEFAULT 0,",
         "  allow_custom_quantity BOOLEAN DEFAULT true,",
         "  min_quantity INTEGER DEFAULT 10,",
         "  max_quantity INTEGER DEFAULT 100000,",
         "  predefined_quantities JSONB,",
         "  cover_image_url TEXT,",
         "  badge_text TEXT,",
         "  usage_notes TEXT,",
         "  link_label TEXT,",
         "  sales_count INTEGER DEFAULT 0,",
         "  display_order INTEGER DEFAULT 0,",
         "  is_active BOOLEAN DEFAULT true,",
         "  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),",
         "  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()",
         ");",
         "",
         "ALTER TABLE public.store_packages ENABLE ROW LEVEL SECURITY;",
         "",
         "CREATE POLICY \"Anyone can view active packages\" ON public.store_packages FOR SELECT USING (is_active = true);",
         "CREATE POLICY \"Admins can manage packages\" ON public.store_packages FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));",
         "",
         "-- Function to increment package sales count",
         "CREATE OR REPLACE FUNCTION public.increment_package_sales(package_id uuid)",
         "RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$",
         "BEGIN",
         "  UPDATE store_packages SET sales_count = sales_count + 1 WHERE id = package_id;",
         "END;",
         "$$;",
         "",
         "-- Create store_orders table",
         "CREATE TABLE IF NOT EXISTS public.store_orders (",
         "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),",
         "  frontend_id UUID REFERENCES public.store_frontends(id) ON DELETE SET NULL,",
         "  package_id UUID REFERENCES public.store_packages(id) ON DELETE SET NULL,",
         "  phone TEXT NOT NULL,",
         "  link TEXT NOT NULL,",
         "  quantity INTEGER NOT NULL,",
         "  total_price NUMERIC NOT NULL,",
         "  service_name TEXT,",
         "  external_order_id INTEGER,",
         "  payment_id TEXT,",
         "  payment_status TEXT DEFAULT 'pending',",
         "  order_status TEXT DEFAULT 'pending',",
         "  start_count TEXT,",
         "  remains TEXT,",
         "  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),",
         "  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()",
         ");",
         "",
         "ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;",
         "",
         "CREATE POLICY \"Anyone can view orders by phone\" ON public.store_orders FOR SELECT USING (true);",
         "CREATE POLICY \"Anyone can insert store orders\" ON public.store_orders FOR INSERT WITH CHECK (phone IS NOT NULL AND length(trim(phone)) > 0 AND COALESCE(payment_status, 'pending') = 'pending' AND COALESCE(order_status, 'pending') = 'pending');",
         "CREATE POLICY \"Anyone can update pending orders\" ON public.store_orders FOR UPDATE USING (COALESCE(payment_status, 'pending') = 'pending') WITH CHECK (COALESCE(payment_status, 'pending') = 'pending');",
         "CREATE POLICY \"Admins can manage all store orders\" ON public.store_orders FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));",
       ].join("\n"),
    },
  ] as const;

  const buildExternalSchemaPatch = async () => {
    const externalClient = getExternalClient();

    if (!externalClient) {
      toast({
        title: "Configuração incompleta",
        description: "Informe URL e Service Role Key do banco externo.",
        variant: "destructive",
      });
      return;
    }

    setIsCheckingExternalSchema(true);
    try {
      const missing: string[] = [];
      const missingTitles: string[] = [];

      for (const patch of EXTERNAL_SCHEMA_PATCHES) {
        try {
          const isMissing = await patch.check(externalClient);
          if (isMissing) {
            missing.push(patch.sql);
            missingTitles.push(patch.title);
          }
        } catch {
          // ignore check errors (e.g. table not exists) — full schema setup covers it
        }
      }

      if (missing.length === 0) {
        toast({
          title: "Schema OK",
          description: "Seu banco externo já possui as atualizações mais recentes para a landing da loja.",
        });
        return;
      }

      const patchSql = [
        "-- =====================================================",
        "-- PATCH: Atualizações rápidas do schema (Banco Externo)",
        "-- Cole e execute no SQL Editor do seu banco externo",
        "-- Itens detectados: " + missingTitles.join(", "),
        "-- =====================================================",
        "",
        ...missing.join("\n\n").split("\n"),
        "",
      ].join("\n");

      setExternalSchemaPatch(patchSql);
      setShowExternalSchemaDialog(true);
    } catch (error: any) {
      toast({
        title: "Erro ao verificar schema",
        description: error.message || "Não foi possível verificar o banco externo.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingExternalSchema(false);
    }
  };

  const copyExternalSchemaPatch = async () => {
    if (!externalSchemaPatch) return;
    await navigator.clipboard.writeText(externalSchemaPatch);
    toast({
      title: "Patch copiado!",
      description: "Cole e execute no SQL Editor do seu banco externo.",
    });
  };

  // Create external client from config
  const getExternalClient = () => {
    if (!config.url || !config.serviceRoleKey) {
      return null;
    }
    return createClient(config.url, config.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  };

  // Clear all data but keep current admin (uses external database directly when configured)
  const clearAllData = async () => {
    const externalClient = getExternalClient();
    const isExternal = hasExternalDatabase();

    setIsClearing(true);
    const errors: string[] = [];

    try {
      // Se estiver usando banco externo, limpar APENAS o banco externo via serviceRoleKey
      if (isExternal && externalClient) {
        // Limpa o banco EXTERNO - ignora erros de tabelas inexistentes
        const tables = [
          "orders",
          "refills",
          "balance_history",
          "support_tickets",
          "imported_services",
          "service_customizations",
          "smm_providers",
          "platform_category_links",
          "platform_icons",
          "category_icons",
          "favorite_services",
          "api_keys",
        ];

        for (const table of tables) {
          try {
            const { error } = await externalClient.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
            // Ignora erros de tabela inexistente (42P01) ou relação inexistente
            if (error && error.code !== "42P01" && !error.message?.includes("relation") && !error.message?.includes("does not exist")) {
              console.error(`Error deleting ${table}:`, error);
              errors.push(`${table}: ${error.message}`);
            }
          } catch (e: any) {
            // Ignora erros de tabela inexistente
            if (!e.message?.includes("relation") && !e.message?.includes("does not exist")) {
              console.error(`Exception deleting ${table}:`, e);
            }
          }
        }

        // Profiles: mantém o admin atual
        if (user?.id) {
          try {
            const { error: deleteError } = await externalClient.from("profiles").delete().neq("id", user.id);
            if (deleteError && deleteError.code !== "42P01") errors.push(`profiles: ${deleteError.message}`);

            const { error: updateError } = await externalClient.from("profiles").update({ balance: 0 }).eq("id", user.id);
            if (updateError && updateError.code !== "42P01") errors.push(`profiles.balance: ${updateError.message}`);
          } catch (e: any) {
            if (!e.message?.includes("does not exist")) console.error("Profiles error:", e);
          }
        }

        // user_roles: mantém o admin atual
        if (user?.id) {
          try {
            const { error } = await externalClient.from("user_roles").delete().neq("user_id", user.id);
            if (error && error.code !== "42P01") errors.push(`user_roles: ${error.message}`);
          } catch (e: any) {
            if (!e.message?.includes("does not exist")) console.error("user_roles error:", e);
          }
        }

        // Remove auth users (except current admin)
        try {
          const { data: listData, error: listError } = await externalClient.auth.admin.listUsers({ perPage: 1000 });
          if (!listError && listData?.users) {
            for (const u of listData.users) {
              if (!u?.id || u.id === user?.id) continue;
              await externalClient.auth.admin.deleteUser(u.id).catch(() => {});
            }
          }
        } catch (e: any) {
          console.error("Auth cleanup error:", e);
        }
      } else {
        // Banco padrão (Lovable Cloud): usa backend function
        if (user?.id) {
          const { data, error } = await backendSupabase.functions.invoke("admin-clean", {
            body: { preserveUserId: user.id },
          });
          if (error || !data?.success) {
            errors.push(`banco atual: ${error?.message || (data?.errors?.[0] ?? "Falha ao limpar")}`);
          }
        } else {
          errors.push("banco atual: usuário não autenticado");
        }
      }

      // Também remove credenciais/configs de provedores salvas no navegador
      removeApiKey();
      const storage = getSafeLocalStorage();
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key && key.startsWith("ai_api_key_")) {
          safeRemoveItem(key);
        }
      }

      if (errors.length > 0) {
        toast({
          title: "Limpeza parcial",
          description: `Algumas tabelas falharam: ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Limpeza concluída!",
          description: isExternal
            ? "Dados removidos do banco externo. Seu admin foi mantido."
            : "Dados removidos do banco Lovable Cloud.",
        });
      }
    } catch (error: any) {
      console.error("Error clearing data:", error);
      toast({
        title: "Erro ao limpar dados",
        description: error.message || "Não foi possível limpar todos os dados.",
        variant: "destructive",
      });
    } finally {
      setIsClearing(false);
    }
  };

  // Clear admin history only (uses external database)
  const clearAdminHistory = async () => {
    const externalClient = getExternalClient();
    
    if (!externalClient) {
      toast({
        title: "Configuração incompleta",
        description: "Configure a URL e Service Role Key do banco externo primeiro.",
        variant: "destructive",
      });
      return;
    }
    
    setIsClearingAdmin(true);
    const errors: string[] = [];
    
    try {
      const tables = ["orders", "refills", "balance_history", "support_tickets"];

      // Limpeza acontece no banco externo (usa Service Role Key)
      for (const table of tables) {
        const { error } = await externalClient.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) {
          console.error(`Error deleting ${table}:`, error);
          errors.push(`${table}: ${error.message}`);
        }
      }

      if (errors.length > 0) {
        toast({
          title: "Limpeza parcial",
          description: `Algumas tabelas falharam: ${errors.join(', ')}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Histórico limpo!",
          description: "Pedidos, recargas e tickets foram removidos do banco externo.",
        });
      }
    } catch (error: any) {
      console.error("Error clearing admin history:", error);
      toast({
        title: "Erro ao limpar histórico",
        description: error.message || "Não foi possível limpar o histórico.",
        variant: "destructive",
      });
    } finally {
      setIsClearingAdmin(false);
    }
  };

  // Create default admin user in external database
  const createDefaultAdmin = async () => {
    const externalClient = getExternalClient();
    
    if (!externalClient) {
      toast({
        title: "Configuração incompleta",
        description: "Configure a URL e Service Role Key do banco externo primeiro.",
        variant: "destructive",
      });
      return;
    }
    
    setIsCreatingAdmin(true);
    
    try {
      const adminEmail = "admin@admin.com";
      const adminPassword = "s96552654";
      
      // Check if admin already exists
      const { data: existingUsers, error: listError } = await externalClient.auth.admin.listUsers();
      
      if (listError) {
        throw new Error(`Erro ao listar usuários: ${listError.message}`);
      }
      
      const adminExists = existingUsers?.users?.some((u: any) => u.email === adminEmail);
      
      if (adminExists) {
        toast({
          title: "Admin já existe",
          description: `O usuário ${adminEmail} já está cadastrado no banco externo.`,
        });
        return;
      }
      
      // Create admin user
      const { data: userData, error: createError } = await externalClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: "Administrador",
        },
      });
      
      if (createError) {
        throw new Error(`Erro ao criar usuário: ${createError.message}`);
      }
      
      // Add admin role
      if (userData.user) {
        const { error: roleError } = await externalClient
          .from("user_roles")
          .insert({ user_id: userData.user.id, role: "admin" });
        
        if (roleError) {
          console.error("Erro ao adicionar role:", roleError);
          // Try to update if exists
          await externalClient
            .from("user_roles")
            .upsert({ user_id: userData.user.id, role: "admin" });
        }
      }
      
      toast({
        title: "Admin criado com sucesso!",
        description: `Login: ${adminEmail} | Senha: ${adminPassword}`,
      });
    } catch (error: any) {
      console.error("Error creating admin:", error);
      toast({
        title: "Erro ao criar admin",
        description: error.message || "Não foi possível criar o usuário admin.",
        variant: "destructive",
      });
    } finally {
    setIsCreatingAdmin(false);
    }
  };

  // Export all data to JSON
  const exportBackup = async () => {
    setIsExporting(true);
    try {
      const isExternal = hasExternalDatabase();

      let response;
      // Always call backend function from Lovable Cloud; pass external creds when needed
      if (isExternal && config.serviceRoleKey) {
        response = await backendSupabase.functions.invoke("backup-export", {
          body: {
            externalUrl: config.url,
            serviceRoleKey: config.serviceRoleKey,
          },
        });
      } else {
        response = await backendSupabase.functions.invoke("backup-export", {
          body: {},
        });
      }

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Falha ao exportar");
      }

      // Download as JSON file
      const backupData = response.data.data;
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smm_backup_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Backup exportado!",
        description: `Arquivo contém ${Object.keys(backupData.tables).length} tabelas e ${Object.keys(backupData.storage || {}).length} buckets de storage.`,
      });
    } catch (error: any) {
      console.error("Export error:", error);
      toast({
        title: "Erro ao exportar",
        description: error.message || "Não foi possível exportar o backup.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Import data from JSON file
  const importBackup = async (file: File, clearExisting: boolean) => {
    setIsImporting(true);
    try {
      const text = await file.text();
      const backupData = JSON.parse(text);

      if (!backupData.tables) {
        throw new Error("Arquivo de backup inválido");
      }

      const isExternal = hasExternalDatabase();

      let response;
      // Always call backend function from Lovable Cloud; pass external creds when needed
      if (isExternal && config.serviceRoleKey) {
        response = await backendSupabase.functions.invoke("backup-import", {
          body: {
            externalUrl: config.url,
            serviceRoleKey: config.serviceRoleKey,
            backupData,
            clearExisting,
          },
        });
      } else {
        response = await backendSupabase.functions.invoke("backup-import", {
          body: {
            backupData,
            clearExisting,
          },
        });
      }

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Falha ao importar");
      }

      const results = response.data;
      const tablesImported = Object.values(results.tables as Record<string, any>).filter((t: any) => t.success).length;
      const totalRecords = Object.values(results.tables as Record<string, any>).reduce((sum: number, t: any) => sum + (t.count || 0), 0);

      toast({
        title: "Backup importado!",
        description: `${tablesImported} tabelas processadas, ${totalRecords} registros importados.`,
      });

      // Refresh table statuses
      if (config.url && config.anonKey) {
        await testConnectionWithConfig(config);
      }
    } catch (error: any) {
      console.error("Import error:", error);
      toast({
        title: "Erro ao importar",
        description: error.message || "Não foi possível importar o backup.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Handle file input for import
  const handleImportFile = (clearExisting: boolean) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        importBackup(file, clearExisting);
      }
    };
    input.click();
  };

  const existingTables = tableStatuses.filter((t) => t.exists).length;
  const totalTables = TABLES_LIST.length;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 sm:gap-3">
          <Database className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
          <span className="hidden xs:inline">Configuração do </span>Banco de Dados
        </h1>
        <p className="text-muted-foreground mt-2 text-sm sm:text-base">
          Configure as credenciais do seu banco Supabase.
        </p>
      </div>

      {/* Status Card */}
      <Card className={isConnected ? "border-green-500/50 bg-green-500/5" : "border-yellow-500/50 bg-yellow-500/5"}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            {isConnected ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="text-green-500">Conectado</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                <span className="text-yellow-500">Não Configurado</span>
              </>
            )}
          </CardTitle>
          <CardDescription>
            {isConnected
              ? `${existingTables} de ${totalTables} tabelas encontradas`
              : "Configure as credenciais abaixo para conectar ao banco de dados"}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle>Credenciais do Supabase</CardTitle>
          <CardDescription>
            Encontre estas informações em Settings → API no seu projeto Supabase
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">URL do Projeto</Label>
            <Input
              id="url"
              placeholder="https://xxxxx.supabase.co"
              value={config.url}
              onChange={(e) => setConfig({ ...config, url: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="anonKey">Anon Key (Chave Pública)</Label>
            <div className="relative">
              <Input
                id="anonKey"
                type={showAnonKey ? "text" : "password"}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={config.anonKey}
                onChange={(e) => setConfig({ ...config, anonKey: e.target.value })}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                onClick={() => setShowAnonKey(!showAnonKey)}
              >
                {showAnonKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serviceRoleKey">Service Role Key (apenas para setup)</Label>
            <div className="relative">
              <Input
                id="serviceRoleKey"
                type={showServiceKey ? "text" : "password"}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={config.serviceRoleKey}
                onChange={(e) => setConfig({ ...config, serviceRoleKey: e.target.value })}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                onClick={() => setShowServiceKey(!showServiceKey)}
              >
                {showServiceKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Esta chave é usada apenas para criar as tabelas. Não é armazenada permanentemente.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={testConnection} disabled={isTesting} variant="outline">
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : (
                "Testar Conexão"
              )}
            </Button>
            <Button onClick={configureDatabase} disabled={isConfiguring || !config.serviceRoleKey}>
              {isConfiguring ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Configurando...
                </>
              ) : (
                "Configurar Banco"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Manual SQL Script Section */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-amber-500" />
            Configuração Manual (Recomendado)
          </CardTitle>
          <CardDescription>
            Siga os passos abaixo para configurar o banco de dados do seu cliente white-label
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-amber-500/30 bg-amber-500/10">
            <Info className="h-4 w-4 text-amber-500" />
            <AlertTitle>Por que configuração manual?</AlertTitle>
            <AlertDescription>
              O Supabase não permite execução automática de SQL via API por motivos de segurança. 
              Este método garante que você tenha controle total sobre o que é executado.
            </AlertDescription>
          </Alert>

          <div className="space-y-3 p-4 rounded-lg bg-muted/50">
            <h4 className="font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Passo a passo:
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Acesse o <strong className="text-foreground">Supabase Dashboard</strong> do projeto do cliente</li>
              <li>No menu lateral, clique em <strong className="text-foreground">SQL Editor</strong></li>
              <li>Clique em <strong className="text-foreground">"New query"</strong> para criar uma nova consulta</li>
              <li>Cole o script SQL (botão abaixo) na área de texto</li>
              <li>Clique em <strong className="text-foreground">"Run"</strong> para executar</li>
              <li>Volte aqui e clique em <strong className="text-foreground">"Testar Conexão"</strong> para verificar</li>
            </ol>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={copySchemaToClipboard} className="bg-primary hover:bg-primary/90">
              <Copy className="w-4 h-4 mr-2" />
              Copiar Script SQL
            </Button>
            <Button variant="outline" onClick={downloadSchema}>
              <Download className="w-4 h-4 mr-2" />
              Baixar Arquivo .sql
            </Button>
          </div>

          <Alert className="border-green-500/30 bg-green-500/5">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertTitle className="text-green-600">Dados pré-configurados inclusos</AlertTitle>
            <AlertDescription className="text-sm">
              O script já inclui conteúdo padrão para: Landing Page, SEO, Termos de Uso, 
              Política de Privacidade e Provedores de IA.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Update External Schema (Quick Patch) */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-500" />
            Atualizar schema do Banco Externo (1 clique)
          </CardTitle>
          <CardDescription>
            Detecta atualizações recentes faltando (ex: landing da loja) e gera um patch SQL para você executar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-blue-500/30">
            <Info className="h-4 w-4" />
            <AlertTitle>Importante</AlertTitle>
            <AlertDescription>
              Por segurança, não é possível executar SQL automaticamente no banco externo via API. Este botão verifica e prepara o patch para copiar e rodar no SQL Editor.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={buildExternalSchemaPatch}
              disabled={isCheckingExternalSchema || !config.serviceRoleKey || !config.url}
              className="bg-primary hover:bg-primary/90"
            >
              {isCheckingExternalSchema ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Verificar e Gerar Patch
                </>
              )}
            </Button>
          </div>

          <AlertDialog open={showExternalSchemaDialog} onOpenChange={setShowExternalSchemaDialog}>
            <AlertDialogContent className="max-w-3xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Patch de atualização do schema</AlertDialogTitle>
                <AlertDialogDescription>
                  Copie e execute este patch no SQL Editor do seu banco externo. Depois volte e clique em “Testar Conexão”.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-[45vh] overflow-auto">
                <pre className="text-xs whitespace-pre-wrap break-words">{externalSchemaPatch}</pre>
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel>Fechar</AlertDialogCancel>
                <AlertDialogAction onClick={copyExternalSchemaPatch}>Copiar Patch</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <p className="text-xs text-muted-foreground">
            Requer URL + Service Role Key configurados acima.
          </p>
        </CardContent>
      </Card>

      {/* Create Default Admin */}
      <Card className="border-green-500/30 bg-green-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-green-500" />
            Criar Admin Padrão
          </CardTitle>
          <CardDescription>
            Cria automaticamente o usuário administrador no banco externo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-green-500/30">
            <Info className="h-4 w-4 text-green-500" />
            <AlertTitle>Credenciais do Admin Padrão</AlertTitle>
            <AlertDescription className="space-y-1">
              <p><strong>Email:</strong> admin@admin.com</p>
              <p><strong>Senha:</strong> s96552654</p>
            </AlertDescription>
          </Alert>

          <Button 
            onClick={createDefaultAdmin} 
            disabled={isCreatingAdmin || !config.serviceRoleKey}
            className="bg-green-600 hover:bg-green-700"
          >
            {isCreatingAdmin ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Criando Admin...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Criar Admin no Banco Externo
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground">
            Requer a Service Role Key configurada acima. O admin será criado com email confirmado automaticamente.
          </p>
        </CardContent>
      </Card>

      {/* Schema Sync Info */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-500" />
            Sincronização do Schema
          </CardTitle>
          <CardDescription>
            Sistema de rastreamento automático de tabelas para white-label
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-blue-500/30">
            <Info className="h-4 w-4" />
            <AlertTitle>Como funciona a sincronização</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>O sistema mantém um registro de todas as tabelas em <code className="bg-muted px-1 rounded">src/lib/schemaSync.ts</code></p>
              <p>Quando novas tabelas são criadas via migração, o script white-label é atualizado automaticamente junto.</p>
            </AlertDescription>
          </Alert>

          <div>
            <h4 className="font-medium mb-3">Tabelas Registradas ({TABLE_REGISTRY.length})</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {TABLE_REGISTRY.map((table) => (
                <div
                  key={table.name}
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm"
                >
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="font-medium truncate block">{table.name}</span>
                    <span className="text-xs text-muted-foreground truncate block">{table.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              <strong>Última atualização:</strong> {new Date().toLocaleDateString('pt-BR')} • 
              <strong> Total:</strong> {TABLE_REGISTRY.length} tabelas registradas
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Table Status */}
      {tableStatuses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Status das Tabelas</CardTitle>
            <CardDescription>
              Tabelas necessárias para o funcionamento do painel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {tableStatuses.map((table) => (
                <Badge
                  key={table.name}
                  variant={table.exists ? "default" : "destructive"}
                  className="justify-between gap-2 py-2"
                >
                  {table.exists ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <XCircle className="w-3 h-3" />
                  )}
                  <span className="truncate">{table.name}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Backup & Migration Section */}
      <Card className="border-purple-500/30 bg-purple-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-purple-500" />
            Backup & Migração
          </CardTitle>
          <CardDescription>
            Exporte todos os dados para migração ou faça backup completo do sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-purple-500/30">
            <Info className="h-4 w-4 text-purple-500" />
            <AlertTitle>O que é incluído no backup?</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Todas as tabelas do banco de dados (configurações, pedidos, usuários, etc.)</li>
                <li>Arquivos do storage (imagens de capas, ícones, etc.)</li>
                <li>Lista de usuários autenticados (emails e metadados)</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Export Section */}
            <div className="p-4 border rounded-lg border-purple-500/20 bg-background">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <Download className="w-4 h-4 text-purple-500" />
                Exportar Backup
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Baixa um arquivo JSON completo com todos os dados do sistema atual.
              </p>
              <Button 
                onClick={exportBackup} 
                disabled={isExporting}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <FileJson className="w-4 h-4 mr-2" />
                    Exportar Backup JSON
                  </>
                )}
              </Button>
            </div>

            {/* Import Section */}
            <div className="p-4 border rounded-lg border-green-500/20 bg-background">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <Upload className="w-4 h-4 text-green-500" />
                Importar Backup
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Restaura dados de um arquivo de backup previamente exportado.
              </p>
              <div className="space-y-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      disabled={isImporting}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Importando...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Importar Backup JSON
                        </>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Importar Backup</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-3">
                        <p>Como deseja importar os dados?</p>
                        <div className="space-y-2 pt-2">
                          <Button 
                            variant="outline" 
                            className="w-full justify-start"
                            onClick={() => handleImportFile(false)}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Mesclar com dados existentes
                          </Button>
                          <Button 
                            variant="destructive" 
                            className="w-full justify-start"
                            onClick={() => handleImportFile(true)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Limpar e substituir tudo
                          </Button>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>

          <Alert className="border-amber-500/30 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-600">Importante</AlertTitle>
            <AlertDescription className="text-sm">
              Se estiver usando banco externo, certifique-se de ter a <strong>Service Role Key</strong> configurada 
              acima para poder importar/exportar dados completos.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Data Cleanup Section */}
      <Card className="border-red-500/30 bg-red-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-500">
            <ShieldAlert className="w-5 h-5" />
            Limpeza de Dados (White-Label)
          </CardTitle>
          <CardDescription>
            Prepare o painel para transferência ou venda removendo todos os dados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Alert className="border-red-500/30">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <AlertTitle className="text-red-500">Tabelas que serão limpas</AlertTitle>
              <AlertDescription className="text-sm">
                Pedidos, recargas, tickets, usuários, provedores SMM, serviços, ícones de plataforma e categoria.
              </AlertDescription>
            </Alert>

            <Alert className="border-green-500/30 bg-green-500/5">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertTitle className="text-green-600">Tabelas preservadas</AlertTitle>
              <AlertDescription className="text-sm">
                Landing Page, SEO, Termos, Privacidade, Provedores IA, Agentes IA, Ações SEO.
              </AlertDescription>
            </Alert>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Clear All Data */}
            <div className="p-4 border rounded-lg border-red-500/20 bg-background">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <Trash2 className="w-4 h-4 text-red-500" />
                Limpar Todos os Dados
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Remove usuários, pedidos, provedores, configurações e históricos. 
                <strong className="text-foreground"> Seu usuário admin será mantido.</strong>
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={isClearing} className="w-full">
                    {isClearing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Limpando...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Limpar Dados do Painel
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação irá remover TODOS os dados do painel: usuários, pedidos, provedores, serviços, configurações e históricos. 
                      Apenas seu usuário admin será preservado. O painel ficará como novo.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={clearAllData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Sim, limpar tudo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Clear Admin History */}
            <div className="p-4 border rounded-lg border-orange-500/20 bg-background">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <RefreshCw className="w-4 h-4 text-orange-500" />
                Limpar Histórico do Admin
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Remove apenas seus pedidos, recargas e tickets pessoais. 
                <strong className="text-foreground"> Mantém todos os outros dados.</strong>
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={isClearingAdmin} className="w-full border-orange-500/50 text-orange-500 hover:bg-orange-500/10">
                    {isClearingAdmin ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Limpando...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Limpar Meu Histórico
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limpar seu histórico?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação irá remover seus pedidos, recargas de saldo e tickets de suporte. 
                      Os dados de outros usuários e configurações do painel serão mantidos.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={clearAdminHistory} className="bg-orange-500 text-white hover:bg-orange-600">
                      Sim, limpar meu histórico
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDatabase;
