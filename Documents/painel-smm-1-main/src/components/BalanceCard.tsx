import { Wallet, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

const BalanceCard = () => {
  const { user } = useAuth();

  const fetchUserBalance = async () => {
    if (!user) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();
    if (error) throw error;
    return data?.balance || 0;
  };

  const { data: balance, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["user-balance", user?.id],
    queryFn: fetchUserBalance,
    enabled: !!user,
    staleTime: 30000,
    retry: 1,
  });

  if (!user) {
    return (
      <div className="glass rounded-xl p-4 border border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
            <Wallet className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Saldo</p>
            <p className="text-lg font-semibold text-muted-foreground">
              Faça login
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl p-4 border-0 bg-gradient-to-br from-emerald-500/40 via-emerald-600/25 to-emerald-900/10 shadow-xl shadow-emerald-500/25">
      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-400/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
      <div className="flex items-center justify-between relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/50 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-emerald-200" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Seu Saldo</p>
            {isLoading ? (
              <div className="h-7 w-24 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-2xl font-bold text-emerald-300">
                {formatCurrency(balance)}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/20"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
};

export default BalanceCard;
