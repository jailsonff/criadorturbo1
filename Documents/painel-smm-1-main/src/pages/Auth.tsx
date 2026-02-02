import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { clearExternalConfig, getCurrentDatabaseInfo, hasExternalDatabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSiteName } from "@/hooks/useSiteName";
import { Loader2, Zap, Mail, Lock, User, Phone, Eye, EyeOff } from "lucide-react";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().trim().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

const signupSchema = z.object({
  email: z.string().trim().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  fullName: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres"),
  phone: z.string().trim().min(10, "WhatsApp deve ter pelo menos 10 dígitos").max(15, "WhatsApp deve ter no máximo 15 dígitos").regex(/^\d+$/, "WhatsApp deve conter apenas números"),
});

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const { signIn, signUp, resendSignupEmail, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const {
    siteName,
    isLoading: siteNameLoading,
    isFetching: siteNameFetching,
    isResolved: siteNameResolved,
  } = useSiteName();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/new-order";

  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  useEffect(() => {
    // Clear confirmation UI when switching modes
    setNeedsEmailConfirmation(false);
    setConfirmationEmail(null);
  }, [isLogin]);

  const validateForm = () => {
    setErrors({});
    try {
      if (isLogin) {
        loginSchema.parse({ email, password });
      } else {
        signupSchema.parse({ email, password, fullName, phone });
      }
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes("Email not confirmed")) {
            setNeedsEmailConfirmation(true);
            setConfirmationEmail(email);
            toast({
              title: "Email não confirmado",
              description:
                "Confirme o email para liberar o acesso. Você pode reenviar o email de confirmação abaixo.",
              variant: "destructive",
            });
            return;
          }

          if (error.message.includes("Invalid login credentials")) {
            toast({
              title: "Erro no login",
              description: "Email ou senha incorretos.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Erro no login",
              description: error.message,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Login realizado!",
            description: "Bem-vindo de volta.",
          });
        }
      } else {
        const { error, needsEmailConfirmation } = await signUp(
          email,
          password,
          fullName,
          phone
        );

        if (error) {
          if (error.message.includes("User already registered")) {
            toast({
              title: "Erro no cadastro",
              description: "Este email já está cadastrado. Tente fazer login.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Erro no cadastro",
              description: error.message,
              variant: "destructive",
            });
          }
        } else {
          if (needsEmailConfirmation) {
            setNeedsEmailConfirmation(true);
            setConfirmationEmail(email);
            setIsLogin(true);
            toast({
              title: "Confirme seu email",
              description:
                "Enviamos um link de confirmação. Depois de confirmar, faça login. Se precisar, reenvie abaixo.",
            });
          } else {
            toast({
              title: "Conta criada!",
              description: "Você já pode acessar o painel.",
            });
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const dbInfo = getCurrentDatabaseInfo();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/30">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center group-hover:glow-primary transition-all duration-300">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              {siteNameLoading || siteNameFetching || !siteNameResolved ? (
                <span className="h-6 w-24 bg-muted animate-pulse rounded" />
              ) : (
                <span className="text-xl font-bold gradient-text">{siteName}</span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4 pt-24">
        <div className="w-full max-w-md">
          {hasExternalDatabase() && (
            <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
              <div className="font-medium">Banco de dados externo ativo</div>
              <div className="text-muted-foreground">
                Para acessar o painel/admin padrão, troque para o banco padrão.
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    clearExternalConfig();
                    window.location.reload();
                  }}
                >
                  Usar banco padrão
                </Button>
                <span className="text-xs text-muted-foreground">Atual: {dbInfo.type}</span>
              </div>
            </div>
          )}

          {/* Card */}
          <div className="glass rounded-2xl p-8 border border-border/50">
            {/* Brand inside card */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              {siteNameLoading || siteNameFetching || !siteNameResolved ? (
                <span className="h-8 w-32 bg-muted animate-pulse rounded" />
              ) : (
                <span className="text-2xl font-bold text-primary">{siteName}</span>
              )}
            </div>
            <p className="text-center text-muted-foreground mb-6">
              {isLogin
                ? "Entre com suas credenciais para acessar"
                : "Preencha os dados para criar sua conta"}
            </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome completo <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Seu nome completo"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                  {errors.fullName && (
                    <p className="text-sm text-destructive">{errors.fullName}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">WhatsApp <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="11999999999"
                      value={phone}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        setPhone(value);
                      }}
                      className="pl-10"
                      maxLength={15}
                      required
                    />
                  </div>
                  {errors.phone && (
                    <p className="text-sm text-destructive">{errors.phone}</p>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isLogin ? "Entrando..." : "Criando conta..."}
                </>
              ) : isLogin ? (
                "Entrar"
              ) : (
                "Criar conta"
              )}
            </Button>

            {isLogin && needsEmailConfirmation && confirmationEmail && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={async () => {
                  setLoading(true);
                  try {
                    const { error } = await resendSignupEmail(confirmationEmail);
                    if (error) {
                      toast({
                        title: "Não foi possível reenviar",
                        description: error.message,
                        variant: "destructive",
                      });
                    } else {
                      toast({
                        title: "Email reenviado",
                        description:
                          "Enviamos novamente o link de confirmação. Verifique sua caixa de entrada e spam.",
                      });
                    }
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Reenviar email de confirmação
              </Button>
            )}
          </form>

          <div className="mt-6 text-center">
            <p className="text-muted-foreground">
              {isLogin ? "Não tem uma conta?" : "Já tem uma conta?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setErrors({});
                }}
                className="text-primary hover:underline font-medium"
              >
                {isLogin ? "Criar conta" : "Fazer login"}
              </button>
            </p>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Ao continuar, você concorda com nossos{" "}
          <a href="/terms" className="text-primary hover:underline">
            Termos de Uso
          </a>{" "}
          e{" "}
          <a href="/privacy" className="text-primary hover:underline">
            Política de Privacidade
          </a>
        </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
