import { useState, useEffect } from "react";
import { FileText, Loader2, Zap, LogIn, Shield, Calendar, ScrollText } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useSiteName } from "@/hooks/useSiteName";

interface TermsContent {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}

const Terms = () => {
  const [terms, setTerms] = useState<TermsContent | null>(null);
  const [loading, setLoading] = useState(true);
  const { siteName } = useSiteName();

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("terms_content")
        .select("*")
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (data) {
        setTerms(data);
      }
    } catch (error) {
      console.error("Error fetching terms:", error);
    } finally {
      setLoading(false);
    }
  };

  // Enhanced markdown to HTML converter
  const renderMarkdown = (text: string) => {
    let sectionIndex = 0;
    return text
      .split("\n")
      .map((line) => {
        if (line.startsWith("## ")) {
          sectionIndex++;
          return `
            <div class="mb-8 group">
              <div class="flex items-start gap-4 mb-3">
                <div class="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <span class="text-lg font-bold text-primary">${sectionIndex}</span>
                </div>
                <h2 class="text-xl font-semibold text-foreground pt-2">${line.slice(3)}</h2>
              </div>
            </div>`;
        }
        if (line.startsWith("# ")) {
          return `<h1 class="text-2xl font-bold text-foreground mb-6">${line.slice(2)}</h1>`;
        }
        if (line.startsWith("- ")) {
          return `<li class="ml-16 text-muted-foreground/90 leading-relaxed list-disc">${line.slice(2)}</li>`;
        }
        if (line.trim() === "") {
          return "";
        }
        return `<p class="ml-16 text-muted-foreground/90 leading-relaxed mb-4">${line}</p>`;
      })
      .join("");
  };

  const Header = () => (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between max-w-5xl">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xl font-bold text-primary">{siteName}</span>
        </Link>
        <Link to="/auth">
          <Button variant="outline" size="sm" className="gap-2">
            <LogIn className="w-4 h-4" />
            Entrar
          </Button>
        </Link>
      </div>
    </header>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Fallback content if no terms in database
  if (!terms) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 pt-28 max-w-3xl">
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <ScrollText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Termos de Uso</h1>
            <p className="text-muted-foreground">
              Os termos de serviço ainda não foram configurados.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <div className="pt-24 pb-8 border-b border-border/50 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Shield className="w-7 h-7 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-center mb-3">
            {terms.title}
          </h1>
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">
              Última atualização: {new Date(terms.updated_at).toLocaleDateString("pt-BR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="bg-card/50 backdrop-blur-sm rounded-2xl border border-border/50 p-6 md:p-10 shadow-lg">
          <div
            className="prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(terms.content) }}
          />
        </div>

        {/* Footer Links */}
        <div className="mt-8 pt-8 border-t border-border/50 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-muted-foreground">
          <Link to="/privacy" className="hover:text-primary transition-colors">
            Política de Privacidade
          </Link>
          <span className="hidden sm:inline">•</span>
          <Link to="/" className="hover:text-primary transition-colors">
            Voltar ao Início
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Terms;
