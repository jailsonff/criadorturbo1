import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, Mail, Clock, Save, Loader2, MessageCircle, Instagram, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSupabaseClient } from "@/lib/supabaseClient";

interface ContactSettings {
  whatsapp_number: string | null;
  support_email: string | null;
  business_hours: string | null;
  instagram_handle: string | null;
  contact_section_title: string | null;
}

const AdminContact = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [businessHours, setBusinessHours] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [whatsappError, setWhatsappError] = useState("");

  // Validate WhatsApp number format
  const validateWhatsapp = (value: string) => {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      setWhatsappError("");
      return true;
    }
    // Must be 10-11 digits (DDD + number) or 12-13 with country code
    if (clean.length < 10) {
      setWhatsappError("Número muito curto. Use DDD + número (ex: 81971196726)");
      return false;
    }
    if (clean.length > 13) {
      setWhatsappError("Número muito longo. Verifique o formato.");
      return false;
    }
    setWhatsappError("");
    return true;
  };

  // Format WhatsApp for display while typing
  const formatWhatsappInput = (value: string) => {
    const clean = value.replace(/\D/g, "");
    return clean;
  };

  const handleWhatsappChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatWhatsappInput(e.target.value);
    setWhatsappNumber(formatted);
    validateWhatsapp(formatted);
  };

  // Get formatted preview
  const getWhatsappPreview = (num: string) => {
    const clean = num.replace(/\D/g, "");
    if (!clean) return "";
    const withoutCountry = clean.startsWith("55") ? clean.slice(2) : clean;
    if (withoutCountry.length === 11) {
      return `(${withoutCountry.slice(0, 2)}) ${withoutCountry.slice(2, 7)}-${withoutCountry.slice(7)}`;
    } else if (withoutCountry.length === 10) {
      return `(${withoutCountry.slice(0, 2)}) ${withoutCountry.slice(2, 6)}-${withoutCountry.slice(6)}`;
    }
    return clean;
  };

  // Fetch current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ["contact-settings"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("site_settings")
        .select("whatsapp_number, support_email, business_hours, instagram_handle, contact_section_title")
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      return data as ContactSettings | null;
    },
  });

  // Update form when data loads
  useEffect(() => {
    if (settings) {
      setWhatsappNumber(settings.whatsapp_number || "");
      setSupportEmail(settings.support_email || "");
      setBusinessHours(settings.business_hours || "Segunda a Sexta: 9h às 18h\nSábado: 9h às 14h");
      setInstagramHandle(settings.instagram_handle || "@agenciarecife_");
      setContactTitle(settings.contact_section_title || "Fale com a Agência Recife");
    }
  }, [settings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: ContactSettings) => {
      const supabase = getSupabaseClient();
      
      // Check if settings exist
      const { data: existing } = await supabase
        .from("site_settings")
        .select("id")
        .single();
      
      if (existing) {
        const { error } = await supabase
          .from("site_settings")
          .update({
            whatsapp_number: data.whatsapp_number,
            support_email: data.support_email,
            business_hours: data.business_hours,
            instagram_handle: data.instagram_handle,
            contact_section_title: data.contact_section_title,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("site_settings")
          .insert({
            whatsapp_number: data.whatsapp_number,
            support_email: data.support_email,
            business_hours: data.business_hours,
            instagram_handle: data.instagram_handle,
            contact_section_title: data.contact_section_title,
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-settings"] });
      toast({
        title: "Configurações salvas!",
        description: "Os dados de contato foram atualizados.",
      });
    },
    onError: (error) => {
      console.error("Error saving contact settings:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      whatsapp_number: whatsappNumber || null,
      support_email: supportEmail || null,
      business_hours: businessHours || null,
      instagram_handle: instagramHandle || null,
      contact_section_title: contactTitle || null,
    });
  };

  // Format WhatsApp number for display
  const formatWhatsAppLink = (number: string) => {
    const cleanNumber = number.replace(/\D/g, "");
    return `https://wa.me/${cleanNumber}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="px-4 lg:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Configurações de Contato</h1>
          <p className="text-muted-foreground">
            Configure os dados de contato exibidos na página de suporte
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="glass rounded-xl p-6 border border-border/50 space-y-6">
            {/* Contact Section Title */}
            <div className="space-y-2">
              <Label htmlFor="contactTitle" className="flex items-center gap-2">
                <Type className="w-4 h-4 text-cyan-500" />
                Título da Seção de Contato (Store Front)
              </Label>
              <Input
                id="contactTitle"
                type="text"
                placeholder="Fale com a Agência Recife"
                value={contactTitle}
                onChange={(e) => setContactTitle(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Título exibido na seção de contato da Store Front
              </p>
            </div>

            {/* Instagram */}
            <div className="space-y-2">
              <Label htmlFor="instagram" className="flex items-center gap-2">
                <Instagram className="w-4 h-4 text-pink-500" />
                Instagram
              </Label>
              <Input
                id="instagram"
                type="text"
                placeholder="@seuinstagram"
                value={instagramHandle}
                onChange={(e) => setInstagramHandle(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Nome de usuário com @ (ex: @agenciarecife_)
              </p>
            </div>

            {/* WhatsApp */}
            <div className="space-y-2">
              <Label htmlFor="whatsapp" className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-success" />
                Número do WhatsApp
              </Label>
              <Input
                id="whatsapp"
                type="text"
                placeholder="81971196726"
                value={whatsappNumber}
                onChange={handleWhatsappChange}
                className={whatsappError ? "border-destructive" : ""}
                maxLength={13}
              />
              {whatsappError ? (
                <p className="text-xs text-destructive">{whatsappError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Apenas números: DDD + número (ex: 81971196726) - Código do país é opcional
                </p>
              )}
              {whatsappNumber && !whatsappError && (
                <p className="text-xs text-success">
                  ✓ Será exibido como: {getWhatsappPreview(whatsappNumber)}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                E-mail de Suporte
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="suporte@exemplo.com"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
              />
            </div>

            {/* Business Hours */}
            <div className="space-y-2">
              <Label htmlFor="hours" className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-warning" />
                Horário de Atendimento
              </Label>
              <Textarea
                id="hours"
                placeholder="Segunda a Sexta: 9h às 18h&#10;Sábado: 9h às 14h"
                value={businessHours}
                onChange={(e) => setBusinessHours(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Use quebras de linha para separar os dias
              </p>
            </div>

            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="w-full"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Configurações
                </>
              )}
            </Button>
          </div>

          {/* Preview */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Prévia</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Assim ficará na Store Front e página de suporte:
            </p>

            {/* Contact Title Preview */}
            <div className="glass rounded-xl p-4 border border-cyan-500/30">
              <p className="text-xs text-muted-foreground mb-1">Título da seção:</p>
              <p className="font-semibold text-lg">
                📲 {contactTitle || "Fale com a Agência Recife"}
              </p>
            </div>

            {/* Instagram Preview */}
            <div className="glass rounded-xl p-6 border border-border/50">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center">
                  <Instagram className="w-6 h-6 text-pink-500" />
                </div>
                <div>
                  <h3 className="font-semibold">Instagram</h3>
                  <p className="text-sm text-muted-foreground">Redes sociais</p>
                </div>
              </div>
              <Button 
                className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600" 
                disabled={!instagramHandle}
                asChild={!!instagramHandle}
              >
                {instagramHandle ? (
                  <a
                    href={`https://instagram.com/${instagramHandle.replace("@", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gap-2"
                  >
                    <Instagram className="w-4 h-4" />
                    {instagramHandle}
                  </a>
                ) : (
                  <span className="gap-2">
                    <Instagram className="w-4 h-4" />
                    Não configurado
                  </span>
                )}
              </Button>
            </div>

            {/* WhatsApp Preview */}
            <div className="glass rounded-xl p-6 border border-border/50">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-success" />
                </div>
                <div>
                  <h3 className="font-semibold">WhatsApp</h3>
                  <p className="text-sm text-muted-foreground">Resposta rápida</p>
                </div>
              </div>
              <Button 
                className="w-full bg-success hover:bg-success/90" 
                disabled={!whatsappNumber}
                asChild={!!whatsappNumber}
              >
                {whatsappNumber ? (
                  <a
                    href={formatWhatsAppLink(whatsappNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Abrir WhatsApp
                  </a>
                ) : (
                  <span className="gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Não configurado
                  </span>
                )}
              </Button>
            </div>

            {/* Email Preview */}
            <div className="glass rounded-xl p-6 border border-border/50">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">E-mail</h3>
                  <p className="text-sm text-muted-foreground">Suporte detalhado</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="w-full" 
                disabled={!supportEmail}
                asChild={!!supportEmail}
              >
                {supportEmail ? (
                  <a href={`mailto:${supportEmail}`} className="gap-2">
                    <Mail className="w-4 h-4" />
                    {supportEmail}
                  </a>
                ) : (
                  <span className="gap-2">
                    <Mail className="w-4 h-4" />
                    Não configurado
                  </span>
                )}
              </Button>
            </div>

            {/* Business Hours Preview */}
            <div className="glass rounded-xl p-6 border border-primary/30">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Horário de Atendimento</h3>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {businessHours || "Não configurado"}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminContact;
