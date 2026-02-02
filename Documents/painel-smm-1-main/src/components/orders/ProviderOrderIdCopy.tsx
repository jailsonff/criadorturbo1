import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type ProviderOrderIdCopyProps = {
  id?: string | number | null;
  className?: string;
  prefix?: string;
};

export default function ProviderOrderIdCopy({
  id,
  className,
  prefix = "ID:",
}: ProviderOrderIdCopyProps) {
  const { toast } = useToast();
  const value = id === null || id === undefined ? "" : String(id).trim();

  if (!value) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "ID copiado!", duration: 1500 });
    } catch {
      toast({ title: "Erro", description: "Não foi possível copiar o ID.", variant: "destructive" });
    }
  };

  return (
    <span className={className ?? ""}>
      <span className="text-muted-foreground">{prefix}</span>{" "}
      <span className="font-mono text-foreground/90">{value}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        className="h-5 w-5 ml-1 text-muted-foreground hover:text-foreground"
        aria-label="Copiar ID"
        title="Copiar ID"
      >
        <Copy className="h-3 w-3" />
      </Button>
    </span>
  );
}
