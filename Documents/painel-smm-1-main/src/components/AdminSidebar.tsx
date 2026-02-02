import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  TicketCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  LogOut,
  Home,
  ShoppingCart,
  Package,
  CreditCard,
  FileText,
  Shield,
  Bot,
  Server,
  Layout,
  Search,
  Smile,
  Image,
  Database,
  RefreshCw,
  Cloud,
  HardDrive,
  Phone,
  Smartphone,
  ListOrdered,
  Store,
  ShoppingBag,
  Layers,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getSupabaseClient, getCurrentDatabaseInfo } from "@/lib/supabaseClient";
import { useSiteName } from "@/hooks/useSiteName";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MenuItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  showBadge?: boolean;
}

const adminMenuItems: MenuItem[] = [
  { to: "/admin-dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin-orders", label: "Pedidos", icon: ShoppingCart },
  { to: "/admin-refills", label: "Reposições", icon: RefreshCw },
  { to: "/admin-providers", label: "Fornecedores", icon: Server },
  { to: "/admin-services", label: "Serviços", icon: Package },
  { to: "/admin-platforms", label: "Plataformas", icon: Image },
  { to: "/admin-category-icons", label: "Ícones Categorias", icon: Smile },
  { to: "/admin-category-order", label: "Ordem Categorias", icon: ListOrdered },
  { to: "/users", label: "Usuários", icon: Users },
  { to: "/admin-tickets", label: "Tickets", icon: TicketCheck, showBadge: true },
  { to: "/admin-ai", label: "Inteligência Artificial", icon: Bot },

  { to: "/admin-store-frontends", label: "Loja: Frontends", icon: Store },
  { to: "/admin-store-sections", label: "Loja: Sessões", icon: Layers },
  { to: "/admin-store-banners", label: "Loja: Banners", icon: Image },
  { to: "/admin-store-popups", label: "Loja: Popups", icon: Layout },
  { to: "/admin-store-packages", label: "Loja: Pacotes", icon: ShoppingBag },
  { to: "/admin-store-orders", label: "Loja: Pedidos", icon: ShoppingCart },
  { to: "/admin-store-users", label: "Loja: Usuários", icon: Users },

  { to: "/admin-landing", label: "Landing Page", icon: Layout },
  { to: "/admin-seo", label: "SEO & Marketing", icon: Search },
  { to: "/admin-pwa", label: "App (PWA)", icon: Smartphone },
  { to: "/admin-contact", label: "Contato", icon: Phone },
  { to: "/admin-terms", label: "Termos", icon: FileText },
  { to: "/admin-privacy", label: "Privacidade", icon: Shield },
  { to: "/mercadopago-settings", label: "MercadoPago", icon: CreditCard },
  { to: "/admin-database", label: "Banco de Dados", icon: Database },
  { to: "/settings", label: "Configurações", icon: Settings },
];

const AdminSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, toggleSidebar } = useSidebar();
  const { signOut, user } = useAuth();
  const { toast } = useToast();
  const { siteName } = useSiteName();
  const isCollapsed = state === "collapsed";
  const [pendingTickets, setPendingTickets] = useState(0);
  const [dbInfo, setDbInfo] = useState(() => getCurrentDatabaseInfo());

  const isActive = (path: string) => location.pathname === path;

  // Update database info when component mounts or storage changes
  useEffect(() => {
    const updateDbInfo = () => setDbInfo(getCurrentDatabaseInfo());
    
    window.addEventListener("storage", updateDbInfo);
    return () => window.removeEventListener("storage", updateDbInfo);
  }, []);

  useEffect(() => {
    const fetchPendingTickets = async () => {
      const supabase = getSupabaseClient();
      const { count } = await supabase
        .from("support_tickets")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]);
      
      setPendingTickets(count || 0);
    };

    fetchPendingTickets();

    // Subscribe to realtime updates
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel("admin-tickets-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets" },
        () => {
          fetchPendingTickets();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleLogout = async () => {
    await signOut();
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado com sucesso.",
    });
    navigate("/");
  };

  return (
    <Sidebar 
      className="border-r border-border/50 bg-sidebar"
      collapsible="icon"
    >
      <SidebarHeader className="p-4">
        <Link to="/admin-dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
            <Zap className="w-6 h-6 text-amber-500" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="text-xl font-bold text-amber-500">{siteName}</span>
              <span className="text-xs text-muted-foreground">Painel Admin</span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3">
        {/* User Dashboard Shortcut */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Dashboard Usuário">
                  <Link
                    to="/new-order"
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 border-2",
                      "bg-gradient-to-r from-primary/20 to-emerald-500/20 border-primary/50",
                      "hover:from-primary/30 hover:to-emerald-500/30 hover:border-primary",
                      "text-primary font-medium shadow-lg shadow-primary/10"
                    )}
                  >
                    <Home className="w-5 h-5 shrink-0" />
                    {!isCollapsed && <span>Dashboard Usuário</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Menu Items */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1.5">
              {adminMenuItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.to)}
                    tooltip={item.label}
                  >
                    <Link 
                      to={item.to}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 border",
                        isActive(item.to)
                          ? "bg-amber-500 text-white font-medium border-amber-500 shadow-md shadow-amber-500/20"
                          : "border-border/50 bg-card/30 hover:bg-muted/50 hover:border-amber-500/50 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <item.icon className="w-5 h-5 shrink-0" />
                      {!isCollapsed && (
                        <span className="flex-1 flex items-center justify-between">
                          {item.label}
                          {item.showBadge && pendingTickets > 0 && (
                            <Badge 
                              variant="destructive" 
                              className="ml-2 h-5 min-w-5 flex items-center justify-center text-xs px-1.5"
                            >
                              {pendingTickets}
                            </Badge>
                          )}
                        </span>
                      )}
                      {isCollapsed && item.showBadge && pendingTickets > 0 && (
                        <Badge 
                          variant="destructive" 
                          className="absolute -top-1 -right-1 h-4 min-w-4 flex items-center justify-center text-[10px] px-1"
                        >
                          {pendingTickets}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 space-y-2">
        {/* Database Status Indicator */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/admin-database"
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 text-xs",
                  dbInfo.type === "external"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-primary/20 text-primary border border-primary/30"
                )}
              >
                {dbInfo.type === "external" ? (
                  <HardDrive className="w-4 h-4 shrink-0" />
                ) : (
                  <Cloud className="w-4 h-4 shrink-0" />
                )}
                {!isCollapsed && (
                  <div className="flex flex-col overflow-hidden">
                    <span className="font-medium truncate">
                      {dbInfo.type === "external" ? "Banco Externo" : "Lovable Cloud"}
                    </span>
                    <span className="text-[10px] opacity-70 truncate">
                      {new URL(dbInfo.url).hostname}
                    </span>
                  </div>
                )}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="font-medium">
                {dbInfo.type === "external" ? "Banco de Dados Externo" : "Lovable Cloud"}
              </p>
              <p className="text-xs text-muted-foreground">{dbInfo.url}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {user && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className={cn(
              "w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10",
              isCollapsed ? "justify-center" : "justify-start"
            )}
          >
            <LogOut className="w-4 h-4" />
            {!isCollapsed && <span className="ml-2">Sair</span>}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="w-full justify-center"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 mr-2" />
              <span>Recolher</span>
            </>
          )}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AdminSidebar;
