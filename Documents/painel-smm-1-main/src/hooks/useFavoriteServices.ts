import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const useFavoriteServices = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ["favorite-services", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("favorite_services")
        .select("service_id")
        .eq("user_id", user.id);

      // External DB might not have this table yet
      if (error) {
        const msg = String((error as any)?.message || "");
        if ((error as any)?.code === "42P01" || msg.includes("does not exist")) {
          return [];
        }
        throw error;
      }

      return (data || []).map((f) => f.service_id);
    },
    enabled: !!user?.id,
  });

  const addFavorite = useMutation({
    mutationFn: async (serviceId: number) => {
      if (!user?.id) throw new Error("User not authenticated");
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("favorite_services")
        .insert({ user_id: user.id, service_id: serviceId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorite-services"] });
      toast.success("Serviço adicionado aos favoritos");
    },
    onError: () => {
      toast.error("Erro ao adicionar favorito");
    },
  });

  const removeFavorite = useMutation({
    mutationFn: async (serviceId: number) => {
      if (!user?.id) throw new Error("User not authenticated");
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("favorite_services")
        .delete()
        .eq("user_id", user.id)
        .eq("service_id", serviceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorite-services"] });
      toast.success("Serviço removido dos favoritos");
    },
    onError: () => {
      toast.error("Erro ao remover favorito");
    },
  });

  const isFavorite = (serviceId: number) => favorites.includes(serviceId);

  const toggleFavorite = (serviceId: number) => {
    if (isFavorite(serviceId)) {
      removeFavorite.mutate(serviceId);
    } else {
      addFavorite.mutate(serviceId);
    }
  };

  return {
    favorites,
    isLoading,
    isFavorite,
    toggleFavorite,
    addFavorite: addFavorite.mutate,
    removeFavorite: removeFavorite.mutate,
  };
};
