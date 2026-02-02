import { useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type Props = {
  customerId: string;
  onCreated?: () => void;
};

export function StoreCustomerCreditsForm({ customerId, onCreated }: Props) {
  const supabase = getSupabaseClient();
  const { toast } = useToast();
  const [serviceId, setServiceId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => {
    return {
      serviceId: Math.max(0, Math.floor(Number(serviceId) || 0)),
      quantity: Math.max(0, Math.floor(Number(quantity) || 0)),
    };
  }, [quantity, serviceId]);

  const canSave = parsed.serviceId > 0 && parsed.quantity > 0 && !!customerId && !saving;

  const handleCreate = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("store_customer_credits").insert({
        customer_id: customerId,
        service_id: parsed.serviceId,
        quantity_remaining: parsed.quantity,
        note: note.trim() || null,
      } as any);
      if (error) throw error;

      toast({
        title: "Crédito adicionado",
        description: `+${parsed.quantity.toLocaleString()} para o serviço ${parsed.serviceId}.`,
      });
      setServiceId("");
      setQuantity("");
      setNote("");
      onCreated?.();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Falha ao adicionar crédito.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Separator />
      <div>
        <p className="text-sm font-semibold">Adicionar crédito (quantidade do serviço)</p>
        <p className="text-xs text-muted-foreground">
          Use quando um link foi cancelado/erro: você credita a mesma quantidade para o cliente reutilizar no MESMO serviço.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>ID do serviço</Label>
          <Input
            inputMode="numeric"
            placeholder="Ex: 2519"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="space-y-2">
          <Label>Quantidade</Label>
          <Input
            inputMode="numeric"
            placeholder="Ex: 5000"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Observação (opcional)</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: Reembolso link inválido" />
      </div>

      <div className="flex items-center justify-end">
        <Button onClick={handleCreate} disabled={!canSave}>
          {saving ? "Salvando…" : "Adicionar crédito"}
        </Button>
      </div>
    </div>
  );
}
