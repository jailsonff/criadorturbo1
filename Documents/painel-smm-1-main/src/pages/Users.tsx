import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Users as UsersIcon, Mail, Phone, Wallet, Pencil, Search, Shield, Calendar, Hash, User, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  balance: number | null;
  created_at: string;
  updated_at: string;
}

interface UserRole {
  role: 'admin' | 'moderator' | 'user';
}

const Users = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Form state for editing
  const [editForm, setEditForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    balance: "",
    isAdmin: false,
  });
  const [loadingRole, setLoadingRole] = useState(false);

  const filteredUsers = users.filter((profile) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      (profile.full_name?.toLowerCase().includes(query)) ||
      (profile.email?.toLowerCase().includes(query)) ||
      (profile.phone?.toLowerCase().includes(query))
    );
  });

  useEffect(() => {
    const checkAdminAndFetchUsers = async () => {
      if (!user) {
        navigate("/auth");
        return;
      }

      const supabase = getSupabaseClient();
      
      // Check if user is admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        toast({
          title: "Acesso negado",
          description: "Você não tem permissão para acessar esta página.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      setIsAdmin(true);

      // Fetch all users
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching users:", error);
        toast({
          title: "Erro",
          description: "Erro ao carregar usuários.",
          variant: "destructive",
        });
      } else {
        setUsers(data || []);
        
        // Fetch all admin users
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        
        if (admins) {
          setAdminUserIds(new Set(admins.map(a => a.user_id)));
        }
      }

      setLoading(false);
    };

    checkAdminAndFetchUsers();
  }, [user, navigate, toast]);

  // Using centralized formatCurrency from utils

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleOpenEditUser = async (profile: UserProfile) => {
    setEditingUser(profile);
    setLoadingRole(true);
    const supabase = getSupabaseClient();
    
    // Set form values
    setEditForm({
      full_name: profile.full_name || "",
      email: profile.email || "",
      phone: profile.phone || "",
      balance: String(profile.balance || 0),
      isAdmin: false,
    });

    // Check if user has admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id)
      .eq("role", "admin")
      .maybeSingle();

    setEditForm(prev => ({ ...prev, isAdmin: !!roleData }));
    setLoadingRole(false);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    const balanceValue = parseFloat(editForm.balance);
    if (isNaN(balanceValue) || balanceValue < 0) {
      toast({
        title: "Erro",
        description: "Digite um valor válido para o saldo.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdating(true);

    try {
      const supabase = getSupabaseClient();
      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: editForm.full_name || null,
          phone: editForm.phone || null,
          balance: balanceValue,
        })
        .eq("id", editingUser.id);

      if (profileError) throw profileError;

      // Handle admin role
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", editingUser.id)
        .eq("role", "admin")
        .maybeSingle();

      if (editForm.isAdmin && !existingRole) {
        // Add admin role
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({ user_id: editingUser.id, role: "admin" });
        if (roleError) throw roleError;
      } else if (!editForm.isAdmin && existingRole) {
        // Remove admin role
        const { error: roleError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", editingUser.id)
          .eq("role", "admin");
        if (roleError) throw roleError;
      }

      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? { ...u, full_name: editForm.full_name, phone: editForm.phone, balance: balanceValue }
            : u
        )
      );

      // Update admin IDs set
      setAdminUserIds(prev => {
        const newSet = new Set(prev);
        if (editForm.isAdmin) {
          newSet.add(editingUser.id);
        } else {
          newSet.delete(editingUser.id);
        }
        return newSet;
      });

      toast({
        title: "Usuário atualizado",
        description: `As informações de ${editForm.full_name || editForm.email} foram atualizadas.`,
      });
      setEditingUser(null);
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar usuário.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isAdmin && !loading) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Usuários</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie todos os usuários cadastrados na plataforma
        </p>
      </div>

      <Card className="glass-card border-border/50">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-primary" />
            Lista de Usuários
            {!loading && (
              <Badge variant="secondary" className="ml-2">
                {filteredUsers.length} de {users.length}
              </Badge>
            )}
          </CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou telefone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background/50 border-border/50"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {searchQuery ? "Nenhum usuário encontrado com essa busca." : "Nenhum usuário encontrado."}
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-hide">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="text-xs sm:text-sm">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <UsersIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Nome</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-xs sm:text-sm">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <Mail className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Email</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-xs sm:text-sm hidden md:table-cell">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <Phone className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Telefone</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-xs sm:text-sm">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <Wallet className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Saldo</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-xs sm:text-sm hidden lg:table-cell">Cadastro</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((profile) => (
                    <TableRow 
                      key={profile.id} 
                      className={`border-border/30 ${adminUserIds.has(profile.id) ? 'bg-yellow-500/5' : ''}`}
                    >
                      <TableCell className="font-medium text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          {profile.full_name || "Sem nome"}
                          {adminUserIds.has(profile.id) && (
                            <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 text-[10px] px-1.5 py-0">
                              <Shield className="w-3 h-3 mr-1" />
                              Admin
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs sm:text-sm max-w-[120px] sm:max-w-none truncate">
                        {profile.email || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs sm:text-sm hidden md:table-cell">
                        {profile.phone || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="border-primary/50 text-primary text-xs"
                        >
                          {formatCurrency(profile.balance)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs sm:text-sm hidden lg:table-cell">
                        {formatDate(profile.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEditUser(profile)}
                          className="hover:bg-primary/10 hover:text-primary h-8 w-8 sm:h-9 sm:w-9"
                        >
                          <Pencil className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="glass-card border-border/50 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Editar Usuário
            </DialogTitle>
            <DialogDescription>
              Edite todas as informações do usuário
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-5">
              {/* User ID */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  <Hash className="w-3 h-3" />
                  ID do Usuário
                </Label>
                <Input
                  value={editingUser.id}
                  disabled
                  className="bg-muted/50 text-xs font-mono"
                />
              </div>

              <Separator />

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="edit-name" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Nome Completo
                </Label>
                <Input
                  id="edit-name"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  placeholder="Nome do usuário"
                  className="bg-background/50 border-border/50"
                />
              </div>

              {/* Email (read-only) */}
              <div className="space-y-2">
                <Label htmlFor="edit-email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </Label>
                <Input
                  id="edit-email"
                  value={editForm.email}
                  disabled
                  className="bg-muted/50"
                />
                <p className="text-xs text-muted-foreground">O email não pode ser alterado</p>
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="edit-phone" className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Telefone / WhatsApp
                </Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                  className="bg-background/50 border-border/50"
                />
              </div>

              {/* Balance */}
              <div className="space-y-2">
                <Label htmlFor="edit-balance" className="flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  Saldo (R$)
                </Label>
                <Input
                  id="edit-balance"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.balance}
                  onChange={(e) => setEditForm({ ...editForm, balance: e.target.value })}
                  placeholder="0.00"
                  className="bg-background/50 border-border/50"
                />
              </div>

              <Separator />

              {/* Admin Role */}
              <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                <div className="space-y-1">
                  <Label htmlFor="admin-switch" className="flex items-center gap-2 cursor-pointer">
                    <Shield className="w-4 h-4 text-yellow-500" />
                    Administrador
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Concede acesso total ao painel administrativo
                  </p>
                </div>
                {loadingRole ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Switch
                    id="admin-switch"
                    checked={editForm.isAdmin}
                    onCheckedChange={(checked) => setEditForm({ ...editForm, isAdmin: checked })}
                  />
                )}
              </div>

              <Separator />

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Cadastro
                  </Label>
                  <p className="font-medium">{formatDateTime(editingUser.created_at)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Última atualização
                  </Label>
                  <p className="font-medium">{formatDateTime(editingUser.updated_at)}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setEditingUser(null)}
              className="border-border/50"
            >
              Cancelar
            </Button>
            <Button onClick={handleUpdateUser} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
