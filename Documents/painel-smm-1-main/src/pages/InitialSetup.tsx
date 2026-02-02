import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Database, CheckCircle2, Loader2, Eye, EyeOff, UserPlus, Zap, Info } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { setExternalConfig } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";

interface DatabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

const InitialSetup = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [config, setConfig] = useState<DatabaseConfig>({
    url: "",
    anonKey: "",
    serviceRoleKey: "",
  });
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  const [showServiceKey, setShowServiceKey] = useState(false);
  const [showAnonKey, setShowAnonKey] = useState(false);
  const [step, setStep] = useState(1);

  const createDefaultAdmin = async () => {
    if (!config.url || !config.anonKey || !config.serviceRoleKey) {
      toast({
        title: "Configuração incompleta",
        description: "Preencha todas as credenciais do Supabase.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingAdmin(true);

    try {
      // Create admin client with service role key
      const adminClient = createClient(config.url, config.serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      const adminEmail = "admin@admin.com";
      const adminPassword = "s96552654";

      // Check if admin already exists
      const { data: existingUsers, error: listError } = await adminClient.auth.admin.listUsers();

      if (listError) {
        throw new Error(`Erro ao listar usuários: ${listError.message}`);
      }

      let adminUserId: string | undefined;
      const existingAdmin = existingUsers?.users?.find((u: any) => u.email === adminEmail);

      if (existingAdmin) {
        adminUserId = existingAdmin.id;
        toast({
          title: "Admin já existe",
          description: "Verificando e corrigindo permissões...",
        });
      } else {
        // Create admin user
        const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
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

        adminUserId = userData.user?.id;
      }

      // Add admin role
      if (adminUserId) {
        // First, check if role exists
        const { data: existingRole } = await adminClient
          .from("user_roles")
          .select("id")
          .eq("user_id", adminUserId)
          .eq("role", "admin")
          .maybeSingle();

        if (!existingRole) {
          const { error: roleError } = await adminClient
            .from("user_roles")
            .insert({ user_id: adminUserId, role: "admin" });

          if (roleError) {
            console.error("Erro ao adicionar role:", roleError);
          }
        }

        // Check/create profile
        const { data: existingProfile } = await adminClient
          .from("profiles")
          .select("id")
          .eq("id", adminUserId)
          .maybeSingle();

        if (!existingProfile) {
          await adminClient.from("profiles").insert({
            id: adminUserId,
            email: adminEmail,
            full_name: "Administrador",
            balance: 0,
          });
        }
      }

      // Save external config to localStorage
      setExternalConfig({
        url: config.url,
        anonKey: config.anonKey,
        serviceRoleKey: config.serviceRoleKey,
      });

      toast({
        title: "Setup concluído!",
        description: `Faça login com: ${adminEmail} / ${adminPassword}`,
      });

      // Redirect to auth page
      setTimeout(() => {
        navigate("/auth");
      }, 2000);

    } catch (error: any) {
      console.error("Error creating admin:", error);
      toast({
        title: "Erro no setup",
        description: error.message || "Não foi possível configurar o sistema.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto">
            <Zap className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">SMM Panel</h1>
          <p className="text-muted-foreground">Configuração Inicial</p>
        </div>

        {/* Step 1: Database Credentials */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Conectar ao Banco de Dados
            </CardTitle>
            <CardDescription>
              Cole as credenciais do seu projeto Supabase (Settings → API)
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
              <Label htmlFor="serviceRoleKey">Service Role Key</Label>
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
            </div>
          </CardContent>
        </Card>

        {/* Admin Info */}
        <Alert className="border-green-500/30 bg-green-500/5">
          <Info className="h-4 w-4 text-green-500" />
          <AlertTitle>Credenciais do Admin Padrão</AlertTitle>
          <AlertDescription className="space-y-1">
            <p><strong>Email:</strong> admin@admin.com</p>
            <p><strong>Senha:</strong> s96552654</p>
          </AlertDescription>
        </Alert>

        {/* Create Admin Button */}
        <Button
          onClick={createDefaultAdmin}
          disabled={isCreatingAdmin || !config.url || !config.anonKey || !config.serviceRoleKey}
          className="w-full bg-primary hover:bg-primary/90 h-12 text-lg"
          size="lg"
        >
          {isCreatingAdmin ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Configurando...
            </>
          ) : (
            <>
              <UserPlus className="w-5 h-5 mr-2" />
              Criar Admin e Configurar
            </>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Certifique-se de ter executado o script SQL no seu projeto Supabase antes de continuar.
        </p>
      </div>
    </div>
  );
};

export default InitialSetup;
