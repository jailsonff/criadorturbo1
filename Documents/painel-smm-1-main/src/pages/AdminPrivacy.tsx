import { useState, useEffect } from "react";
import { Shield, Save, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import MarkdownEditor from "@/components/MarkdownEditor";

interface PrivacyContent {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}

const AdminPrivacy = () => {
  const [privacy, setPrivacy] = useState<PrivacyContent | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchPrivacy();
  }, []);

  const fetchPrivacy = async () => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("privacy_content")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        setPrivacy(data);
        setTitle(data.title);
        setContent(data.content);
      }
    } catch (error) {
      console.error("Error fetching privacy:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar a política de privacidade.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast({
        title: "Erro",
        description: "Título e conteúdo são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabaseClient();
      if (privacy) {
        const { error } = await supabase
          .from("privacy_content")
          .update({
            title: title.trim(),
            content: content.trim(),
            updated_at: new Date().toISOString(),
            updated_by: user?.id,
          })
          .eq("id", privacy.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("privacy_content")
          .insert({
            title: title.trim(),
            content: content.trim(),
            updated_by: user?.id,
          });

        if (error) throw error;
      }

      toast({
        title: "Sucesso",
        description: "Política de privacidade atualizada com sucesso!",
      });
      
      fetchPrivacy();
    } catch (error) {
      console.error("Error saving privacy:", error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a política de privacidade.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const renderMarkdown = (text: string) => {
    return text
      .split("\n")
      .map((line) => {
        if (line.startsWith("## ")) {
          return `<div class="flex items-center gap-3 mt-8 mb-4 p-4 rounded-xl bg-primary/10 border border-primary/20">
            <div class="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
              </svg>
            </div>
            <h2 class="text-xl font-bold text-primary">${line.slice(3)}</h2>
          </div>`;
        }
        if (line.startsWith("# ")) {
          return `<h1 class="text-2xl font-bold mt-6 mb-4 text-primary">${line.slice(2)}</h1>`;
        }
        if (line.startsWith("- ")) {
          return `<li class="ml-4">${line.slice(2)}</li>`;
        }
        if (line.trim() === "") {
          return "<br/>";
        }
        return `<p class="mb-2">${line}</p>`;
      })
      .join("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gerenciar Política de Privacidade</h1>
          <p className="text-muted-foreground mt-1">
            Edite o conteúdo da página de política de privacidade
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye className="w-4 h-4 mr-2" />
            {showPreview ? "Editar" : "Visualizar"}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      {privacy?.updated_at && (
        <p className="text-sm text-muted-foreground">
          Última atualização: {new Date(privacy.updated_at).toLocaleString("pt-BR")}
        </p>
      )}

      {showPreview ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Visualização
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-4xl">
              <h1 className="text-3xl font-bold mb-6">{title}</h1>
              <div
                className="prose prose-invert max-w-none text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Título da Página</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Política de Privacidade"
                className="text-lg"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Conteúdo</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Suporta Markdown básico (## para títulos, - para listas)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MarkdownEditor
                value={content}
                onChange={setContent}
                placeholder="Digite o conteúdo da política de privacidade..."
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AdminPrivacy;
