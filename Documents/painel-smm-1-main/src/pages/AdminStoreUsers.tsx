import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { backendSupabase } from "@/lib/backendClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

import { StoreCustomerCreditsForm } from "@/components/admin/StoreCustomerCreditsForm";

import { Search, Users, Pencil, Phone, Calendar, Loader2, KeyRound, RefreshCcw } from "lucide-react";

type StoreCustomer = {
  id: string;
  phone: string;
  full_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export default function AdminStoreUsers() {
  const supabase = getSupabaseClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<StoreCustomer[]>([]);
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState<StoreCustomer | null>(null);
  const [saving, setSaving] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [form, setForm] = useState({ full_name: "", phone: "", notes: "" });

  const refreshList = useCallback(async () => {
    const { data, error } = await supabase
      .from("store_customers")
      .select("id, phone, full_name, notes, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    setCustomers((data || []) as any);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await refreshList();
      } catch (e: any) {
        if (cancelled) return;
        toast({
          title: "Erro",
          description: e?.message || "Falha ao carregar usuários da loja.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshList, toast]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter((c) => {
      return (
        String(c.phone || "").includes(q.replace(/\D/g, "")) ||
        String(c.full_name || "").toLowerCase().includes(q) ||
        String(c.notes || "").toLowerCase().includes(q)
      );
    });
  }, [customers, search]);

  const fmtPhone = (digits: string) => {
    const n = String(digits || "").replace(/\D/g, "");
    if (n.length === 11) return n.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    if (n.length === 10) return n.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    return digits;
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const openEdit = (c: StoreCustomer) => {
    setEditing(c);
    setNewPin("");
    setForm({
      full_name: c.full_name || "",
      phone: fmtPhone(c.phone),
      notes: c.notes || "",
    });
  };

  const handleManualRefresh = async () => {
    setLoading(true);
    try {
      await refreshList();
    } catch (e: any) {
      toast({
        title: "Erro",
        description: e?.message || "Falha ao atualizar a lista.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      toast({ title: "Telefone inválido", description: "Digite um WhatsApp válido.", variant: "destructive" });
      return;
    }
    if (newPin && !/^\d{4}$/.test(newPin)) {
      toast({ title: "Senha inválida", description: "A senha precisa ter 4 dígitos.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("store_customers")
        .update({
          full_name: form.full_name || null,
          notes: form.notes || null,
          phone: phoneDigits,
        })
        .eq("id", editing.id);
      if (error) throw error;

        if (newPin) {
          const { error: pinErr } = await backendSupabase.functions.invoke("store-customer-auth", {
            // Must match edge function Action union (snake_case)
            body: { action: "admin_set_pin", customer_id: editing.id, pin: newPin },
          });
        if (pinErr) throw pinErr;
      }

      await refreshList();
      toast({ title: "Usuário atualizado", description: "Alterações salvas com sucesso." });
      setEditing(null);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Falha ao salvar.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Usuários da Loja</h1>
        <p className="text-muted-foreground">Cadastros de WhatsApp + senha (PIN)</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Lista
            <Badge variant="secondary">{filtered.length}</Badge>
          </CardTitle>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button variant="outline" onClick={handleManualRefresh} disabled={loading} className="w-full sm:w-auto">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              <span className="ml-2">Atualizar</span>
            </Button>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por telefone, nome ou notas..."
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">Nenhum usuário encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <span className="inline-flex items-center gap-2">
                        <Phone className="h-4 w-4" /> WhatsApp
                      </span>
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">Notas</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      <span className="inline-flex items-center gap-2">
                        <Calendar className="h-4 w-4" /> Cadastro
                      </span>
                    </TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{fmtPhone(c.phone)}</TableCell>
                      <TableCell className="text-muted-foreground">{c.full_name || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground max-w-[320px] truncate">
                        {c.notes || "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">{fmtDate(c.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Editar usuário da loja
            </DialogTitle>
            <DialogDescription>
              Você pode alterar o WhatsApp, nome, notas e definir uma nova senha (PIN).
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  Nova senha (PIN 4 dígitos)
                </Label>
                <InputOTP maxLength={4} value={newPin} onChange={setNewPin}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>
                <p className="text-xs text-muted-foreground">
                  Se você não preencher, a senha atual permanece.
                </p>
              </div>

              <StoreCustomerCreditsForm customerId={editing.id} />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
