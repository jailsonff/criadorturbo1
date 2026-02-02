import { getSupabaseClient } from "@/lib/supabaseClient";
import { backendSupabase } from "@/lib/backendClient";
import { safeGetItem, safeRemoveItem, safeSetItem } from "@/lib/safeStorage";

export interface Service {
  service: number;
  name: string;
  type: string;
  category: string;
  rate: string;
  min: string;
  max: string;
  refill: boolean;
  cancel: boolean;
  description?: string;
  dripfeed?: boolean;
  average_time?: string;
}

export interface OrderResponse {
  order: number;
}

export interface OrderStatus {
  charge: string;
  start_count: string;
  status: string;
  remains: string;
  currency: string;
  error?: string;
}

export interface BalanceResponse {
  balance: string;
  currency: string;
}

export interface RefillResponse {
  refill: string;
}

export interface RefillStatusResponse {
  status: string;
  error?: string;
}

export interface LocalOrder {
  id: number;
  serviceId: number;
  serviceName: string;
  link: string;
  quantity: number;
  createdAt: string;
  status?: OrderStatus;
}

export const getApiKey = (): string | null => {
  return safeGetItem("smm_api_key");
};

export const setApiKey = (key: string): void => {
  safeSetItem("smm_api_key", key);
};

export const removeApiKey = (): void => {
  safeRemoveItem("smm_api_key");
};

// Get current user ID from localStorage (set by auth context)
const getCurrentUserId = (): string | null => {
  return safeGetItem("smm_current_user_id");
};

export const setCurrentUserId = (userId: string | null): void => {
  const previousUserId = getCurrentUserId();
  
  // If user changed, clear the old user's local data
  if (previousUserId && previousUserId !== userId) {
    safeRemoveItem(`smm_orders_${previousUserId}`);
  }
  
  if (userId) {
    safeSetItem("smm_current_user_id", userId);
  } else {
    safeRemoveItem("smm_current_user_id");
  }
};

// Local orders management - now user-scoped
export const getLocalOrders = (): LocalOrder[] => {
  const userId = getCurrentUserId();
  if (!userId) return [];

  const key = `smm_orders_${userId}`;
  const orders = safeGetItem(key);
  if (!orders) return [];

  try {
    const parsed = JSON.parse(orders);
    return Array.isArray(parsed) ? (parsed as LocalOrder[]) : [];
  } catch (e) {
    console.error("[getLocalOrders] Invalid localStorage JSON, clearing key:", key, e);
    safeRemoveItem(key);
    return [];
  }
};


export const saveLocalOrder = (order: LocalOrder): void => {
  const userId = getCurrentUserId();
  if (!userId) return;
  
  const orders = getLocalOrders();
  orders.unshift(order); // Add to beginning
  safeSetItem(`smm_orders_${userId}`, JSON.stringify(orders));
};

export const updateLocalOrderStatus = (orderId: number, status: OrderStatus): void => {
  const userId = getCurrentUserId();
  if (!userId) return;
  
  const orders = getLocalOrders();
  const index = orders.findIndex((o) => o.id === orderId);
  if (index !== -1) {
    orders[index].status = status;
    safeSetItem(`smm_orders_${userId}`, JSON.stringify(orders));
  }
};

export const removeLocalOrder = (orderId: number): void => {
  const userId = getCurrentUserId();
  if (!userId) return;
  
  const orders = getLocalOrders();
  const filtered = orders.filter((o) => o.id !== orderId);
  safeSetItem(`smm_orders_${userId}`, JSON.stringify(filtered));
};

// Clear all user-specific data (for logout)
export const clearUserLocalData = (): void => {
  const userId = getCurrentUserId();
  if (userId) {
    safeRemoveItem(`smm_orders_${userId}`);
  }
  safeRemoveItem("smm_current_user_id");
};

// Sync local orders to Supabase database
export const syncLocalOrdersToDatabase = async (userId: string): Promise<number> => {
  const supabase = getSupabaseClient();
  const localOrders = getLocalOrders();
  if (localOrders.length === 0) return 0;

  let syncedCount = 0;

  // Get existing order_ids from database for this user
  const { data: existingOrders } = await supabase
    .from("orders")
    .select("order_id")
    .eq("user_id", userId);

  const existingOrderIds = new Set(existingOrders?.map(o => o.order_id) || []);

  // Filter orders that don't exist in database
  const ordersToSync = localOrders.filter(o => !existingOrderIds.has(o.id));

  for (const order of ordersToSync) {
    try {
      const { error } = await supabase.from("orders").insert({
        order_id: order.id,
        user_id: userId,
        service_id: order.serviceId,
        service_name: order.serviceName || `Serviço ${order.serviceId}`,
        link: order.link || "",
        quantity: order.quantity || 0,
        charge: order.status?.charge ? parseFloat(order.status.charge) : null,
        status: order.status?.status || "pending",
        start_count: order.status?.start_count || null,
        remains: order.status?.remains || null,
        created_at: order.createdAt,
      });

      if (!error) {
        syncedCount++;
      }
    } catch (error) {
      console.error(`Error syncing order ${order.id}:`, error);
    }
  }

  return syncedCount;
};

const callSmmProxy = async (action: string, params: Record<string, unknown> = {}) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API key not configured");
  }

  // Always use backend functions (they are deployed on Lovable Cloud)
  const { data, error } = await backendSupabase.functions.invoke("smm-proxy", {
    body: {
      action,
      key: apiKey,
      ...params,
    },
  });

  if (error) {
    console.error("SMM Proxy error:", error);
    throw new Error(error.message || "Failed to call SMM API");
  }

  return data;
};

export const fetchServices = async (): Promise<Service[]> => {
  return callSmmProxy("services");
};

export const fetchBalance = async (): Promise<BalanceResponse> => {
  return callSmmProxy("balance");
};

export const createOrder = async (
  service: number,
  link: string,
  quantity: number,
  comments?: string
): Promise<OrderResponse> => {
  const supabase = getSupabaseClient();
  
  // Fetch the provider credentials and internal service ID for this service
  // Try with internal_provider_service_id first, fallback if column doesn't exist
  let serviceData: { provider_id: string; internal_provider_service_id?: number | null } | null = null;
  
  const { data: fullData, error: fullError } = await supabase
    .from("imported_services")
    .select("provider_id, internal_provider_service_id")
    .eq("external_service_id", service)
    .maybeSingle();
  
  if (fullError?.code === '42703') {
    // Column doesn't exist, try without it
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("imported_services")
      .select("provider_id")
      .eq("external_service_id", service)
      .maybeSingle();
    
    if (fallbackError) {
      console.error("Error fetching service provider:", fallbackError);
      throw new Error("Failed to fetch service provider");
    }
    
    serviceData = fallbackData ? { ...fallbackData, internal_provider_service_id: null } : null;
  } else if (fullError) {
    console.error("Error fetching service provider:", fullError);
    throw new Error("Failed to fetch service provider");
  } else {
    serviceData = fullData;
  }
  
  if (!serviceData?.provider_id) {
    throw new Error("Service provider not found");
  }
  
  // Fetch the provider's API credentials
  const { data: providerData, error: providerError } = await supabase
    .from("smm_providers")
    .select("api_key, api_url")
    .eq("id", serviceData.provider_id)
    .single();
  
  if (providerError || !providerData) {
    console.error("Error fetching provider credentials:", providerError);
    throw new Error("Failed to fetch provider credentials");
  }
  
  // Use internal_provider_service_id if set, otherwise use the external_service_id
  const actualServiceId = serviceData.internal_provider_service_id ?? service;
  
  // Build request body with optional comments
  const requestBody: Record<string, unknown> = {
    action: "add",
    key: providerData.api_key,
    apiUrl: providerData.api_url,
    service: actualServiceId,
    link,
    quantity,
  };
  
  // Add comments if provided (for custom comments services)
  if (comments && comments.trim()) {
    requestBody.comments = comments.trim();
  }
  
  // Call the SMM proxy with the provider's credentials (always use Lovable Cloud for edge functions)
  const { data, error } = await backendSupabase.functions.invoke("smm-proxy", {
    body: requestBody,
  });
  
  if (error) {
    console.error("SMM Proxy error:", error);
    throw new Error(error.message || "Failed to create order");
  }
  
  if (data?.error) {
    throw new Error(data.error);
  }
  
  return data;
};

export const checkOrderStatus = async (orderId: number): Promise<OrderStatus> => {
  const supabase = getSupabaseClient();
  
  // Fetch the order to get the service_id
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select("service_id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (orderError || !orderData) {
    // Fallback to default provider if order not found
    return callSmmProxy("status", { order: orderId });
  }

  // Fetch the provider credentials for this service
  const { data: serviceData } = await supabase
    .from("imported_services")
    .select("provider_id")
    .eq("external_service_id", orderData.service_id)
    .maybeSingle();

  if (!serviceData?.provider_id) {
    return callSmmProxy("status", { order: orderId });
  }

  const { data: providerData } = await supabase
    .from("smm_providers")
    .select("api_key, api_url")
    .eq("id", serviceData.provider_id)
    .single();

  if (!providerData) {
    return callSmmProxy("status", { order: orderId });
  }

  const { data, error } = await backendSupabase.functions.invoke("smm-proxy", {
    body: {
      action: "status",
      key: providerData.api_key,
      apiUrl: providerData.api_url,
      order: orderId,
    },
  });

  if (error) throw new Error(error.message);
  return data;
};

export const checkMultipleOrdersStatus = async (orderIds: number[]): Promise<Record<string, OrderStatus>> => {
  const supabase = getSupabaseClient();
  
  if (orderIds.length === 0) return {};

  // Fetch orders to get service_ids
  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select("order_id, service_id")
    .in("order_id", orderIds);

  if (ordersError || !ordersData || ordersData.length === 0) {
    return callSmmProxy("status", { orders: orderIds.join(",") });
  }

  // Get unique service_ids
  const serviceIds = [...new Set(ordersData.map(o => o.service_id))];

  // Fetch provider_ids for all services
  const { data: servicesData } = await supabase
    .from("imported_services")
    .select("external_service_id, provider_id")
    .in("external_service_id", serviceIds);

  if (!servicesData || servicesData.length === 0) {
    return callSmmProxy("status", { orders: orderIds.join(",") });
  }

  // Create a map of service_id to provider_id
  const serviceProviderMap = new Map<number, string>(
    servicesData.map(s => [s.external_service_id, s.provider_id])
  );

  // Get unique provider_ids
  const providerIds = [...new Set(servicesData.map(s => s.provider_id))];

  // Fetch all provider credentials
  const { data: providersData } = await supabase
    .from("smm_providers")
    .select("id, api_key, api_url")
    .in("id", providerIds);

  if (!providersData || providersData.length === 0) {
    return callSmmProxy("status", { orders: orderIds.join(",") });
  }

  // Create a map of provider_id to credentials
  const providerCredentialsMap = new Map<string, { api_key: string; api_url: string }>(
    providersData.map(p => [p.id, { api_key: p.api_key, api_url: p.api_url }])
  );

  // Group orders by provider
  const ordersByProvider = new Map<string, number[]>();
  for (const order of ordersData) {
    const providerId = serviceProviderMap.get(order.service_id);
    if (providerId) {
      const orders = ordersByProvider.get(providerId) || [];
      orders.push(order.order_id);
      ordersByProvider.set(providerId, orders);
    }
  }

  // Fetch statuses from each provider
  const allStatuses: Record<string, OrderStatus> = {};
  
  for (const [providerId, providerOrderIds] of ordersByProvider.entries()) {
    const credentials = providerCredentialsMap.get(providerId);
    if (!credentials) continue;

    try {
        const { data } = await backendSupabase.functions.invoke("smm-proxy", {
          body: {
            action: "status",
            key: credentials.api_key,
            apiUrl: credentials.api_url,
            orders: providerOrderIds.join(","),
          },
        });

      if (data && typeof data === 'object') {
        Object.assign(allStatuses, data);
      }
    } catch (error) {
      console.error(`Error fetching status from provider ${providerId}:`, error);
    }
  }

  return allStatuses;
};

export const createRefill = async (orderId: number): Promise<RefillResponse> => {
  const supabase = getSupabaseClient();
  
  // Fetch the order to get the service_id
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select("service_id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (orderError || !orderData) {
    // Fallback to default provider if order not found
    return callSmmProxy("refill", { order: orderId });
  }

  // Fetch the provider credentials for this service
  const { data: serviceData } = await supabase
    .from("imported_services")
    .select("provider_id")
    .eq("external_service_id", orderData.service_id)
    .maybeSingle();

  if (!serviceData?.provider_id) {
    return callSmmProxy("refill", { order: orderId });
  }

  const { data: providerData } = await supabase
    .from("smm_providers")
    .select("api_key, api_url")
    .eq("id", serviceData.provider_id)
    .single();

  if (!providerData) {
    return callSmmProxy("refill", { order: orderId });
  }

  const { data, error } = await backendSupabase.functions.invoke("smm-proxy", {
    body: {
      action: "refill",
      key: providerData.api_key,
      apiUrl: providerData.api_url,
      order: orderId,
    },
  });

  if (error) {
    console.error("SMM Proxy error:", error);
    throw new Error(error.message || "Failed to create refill");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
};

export const checkRefillStatus = async (refillId: string, orderId: number): Promise<RefillStatusResponse> => {
  const supabase = getSupabaseClient();
  
  // Fetch the order to get the service_id
  const { data: orderData } = await supabase
    .from("orders")
    .select("service_id")
    .eq("order_id", orderId)
    .maybeSingle();

  let providerData = null;

  if (orderData?.service_id) {
    // Fetch the provider credentials for this service
    const { data: serviceData } = await supabase
      .from("imported_services")
      .select("provider_id")
      .eq("external_service_id", orderData.service_id)
      .maybeSingle();

    if (serviceData?.provider_id) {
      const { data } = await supabase
        .from("smm_providers")
        .select("api_key, api_url")
        .eq("id", serviceData.provider_id)
        .single();
      
      providerData = data;
    }
  }

  // If no provider found, try default provider
  if (!providerData) {
    const { data: defaultProvider } = await supabase
      .from("smm_providers")
      .select("api_key, api_url")
      .eq("is_default", true)
      .maybeSingle();
    
    providerData = defaultProvider;
  }

  if (!providerData) {
    return callSmmProxy("refill_status", { refill: refillId });
  }

  // Call the SMM proxy with the provider's credentials (always use Lovable Cloud for edge functions)
  const { data, error } = await backendSupabase.functions.invoke("smm-proxy", {
    body: {
      action: "refill_status",
      key: providerData.api_key,
      apiUrl: providerData.api_url,
      refill: refillId,
    },
  });

  if (error) {
    console.error("SMM Proxy error:", error);
    throw new Error(error.message || "Failed to check refill status");
  }

  return data;
};
