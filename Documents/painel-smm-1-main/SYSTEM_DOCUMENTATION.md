# 📋 Documentação Completa — Sistema (Painel SMM + Loja) White‑Label

> **Objetivo deste documento**: descrever **todas as funcionalidades do sistema** (o que faz, como funciona, onde está implementado) e registrar a arquitetura atual para manutenção, auditoria e migração.

---

## 1) Visão geral

Este projeto é um sistema completo com **dois “produtos” no mesmo app**:

1) **Painel SMM (usuário logado por e‑mail)**
   - Usuários criam pedidos, acompanham status, abrem tickets e podem adicionar saldo.
   - Admins gerenciam provedores, serviços, pedidos, tickets, SEO, landing, etc.

2) **Loja pública (/loja) orientada a “pacotes”**
   - Checkout por PIX e acompanhamento de pedido por WhatsApp + PIN.
   - Recursos avançados: banners, popups com hotspots, anti‑duplicidade, multi-link, combos, reabrir PIX, créditos por reembolso e reprocessamento manual.

O sistema suporta **modo White‑Label**, permitindo operar com:

- **Backend padrão (Lovable Cloud)**
- **Banco externo** (instância privada do cliente), mantendo **as mesmas telas** e “apontando” o app para outra base.

---

## 2) Stack / Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI/Estilo | Tailwind + shadcn/ui |
| Estado/Cache | TanStack Query |
| Rotas | React Router |
| Backend | Lovable Cloud (PostgreSQL + Funções backend + Storage) |
| Auth (painel) | Login por e‑mail/senha |
| Auth (loja) | WhatsApp (telefone) + PIN de 4 dígitos (custom) |

---

## 3) Arquitetura de acesso ao banco (padrão x externo)

### 3.1 Conceito

O app usa **um cliente dinâmico** para leituras/escritas de dados:

- Quando **não há configuração externa**, todas as tabelas são lidas do backend padrão.
- Quando **há configuração externa**, as páginas passam a consultar a base externa.

### 3.2 Implementação

- Arquivo: `src/lib/supabaseClient.ts`
- Chave de armazenamento: `supabase_config`

**Funções principais**:

- `getExternalConfig()` → lê `{ url, anonKey, serviceRoleKey? }` do armazenamento seguro
- `getSupabaseClient()` → cria client para o banco atual (externo ou padrão)
- `setExternalConfig(config)` → troca para banco externo e dispara evento
- `clearExternalConfig()` → volta para o banco padrão e dispara evento

**Eventos de sincronização**:

- `window.dispatchEvent(new Event("supabase-config-changed"))`
  - Usado para avisar contextos/componentes (ex.: `AuthContext`) que o “banco ativo” mudou.

### 3.3 Cliente “fixo” do backend para funções

As funções do backend **sempre** são chamadas pelo cliente fixo:

- Arquivo: `src/lib/backendClient.ts`
- Export: `backendSupabase`

Isso garante que chamadas a funções (pagamento, processamento, etc.) continuem existindo no backend padrão mesmo quando os dados estão no banco externo.

---

## 4) Segurança e princípios críticos

### 4.1 Papéis (admin/user/moderator)

- Papéis ficam na tabela `user_roles`.
- A checagem de role é feita via função do banco `has_role(...)` (Security Definer).

### 4.2 RLS (Row Level Security)

O banco usa RLS para proteger dados sensíveis:

- Painel: tabelas ligadas ao usuário usam `auth.uid()`.
- Admin: políticas permitem acesso total quando `has_role(auth.uid(), 'admin')`.
- Loja pública: algumas tabelas são publicamente legíveis por design (ex.: pacotes ativos, banners ativos, conteúdo de landing).

### 4.3 Armazenamento local seguro e resiliência

O projeto evita “tela preta” por falhas de `localStorage` usando `safeStorage`.

- Arquivo: `src/lib/safeStorage.ts`
- Uso: `safeGetItem/safeSetItem/safeRemoveItem` e fallback em memória.

### 4.4 Tratamento de falhas

- `AppErrorBoundary` captura crashes e salva diagnóstico em storage para suporte.

---

## 5) Rotas (mapa completo)

Arquivo fonte de rotas: `src/App.tsx`.

### 5.1 Rotas públicas

| Rota | Página | Função |
|---|---|---|
| `/` | `Root` | Decide entre Landing (`Index`) ou Loja (`/loja`) quando `use_store_landing` está ativo |
| `/auth` | `Auth` | Login/cadastro do painel |
| `/terms` | `Terms` | Termos |
| `/privacy` | `Privacy` | Privacidade |
| `/public-services` | `PublicServices` | Serviços públicos (se habilitado) |
| `/setup` | `InitialSetup` | Setup inicial (white‑label) |
| `/install` | `Install` | Instalação/PWA |
| `/loja` | `StoreFront` | Loja (slug padrão) |
| `/loja/:slug` | `StoreFront` | Loja por slug (multi-frontends) |

### 5.2 Rotas do usuário (protegidas)

| Rota | Página | Função |
|---|---|---|
| `/services` | `Services` | Catálogo interno de serviços do painel |
| `/new-order` | `NewOrder` | Criar pedido (painel) |
| `/bulk-orders` | `BulkOrders` | Pedidos em massa |
| `/orders` | `Orders` | Lista de pedidos |
| `/add-balance` | `AddBalance` | Adicionar saldo (PIX) |
| `/refills` | `Refills` | Refill (quando suportado) |
| `/support` | `Support` | Tickets |
| `/support/ticket/:ticketId` | `TicketChatPage` | Chat do ticket |
| `/settings` | `Settings` | Perfil, API key e preferências |

### 5.3 Rotas do admin (protegidas por role)

| Rota | Página | Função |
|---|---|---|
| `/admin-dashboard` | `AdminDashboard` | Visão geral |
| `/users` | `Users` | Usuários do painel |
| `/admin-tickets` | `AdminTickets` | Tickets |
| `/admin-orders` | `AdminOrders` | Pedidos do painel |
| `/admin-refills` | `AdminRefills` | Refills |
| `/admin-services` | `AdminServices` | Serviços importados/customizados |
| `/admin-providers` | `AdminProviders` | Provedores |
| `/mercadopago-settings` | `MercadoPagoSettings` | Configuração PIX |
| `/admin-terms` | `AdminTerms` | Termos (CMS) |
| `/admin-privacy` | `AdminPrivacy` | Privacidade (CMS) |
| `/admin-ai` | `AdminAI` | Provedores/agentes de IA |
| `/admin-landing` | `AdminLanding` | Landing (CMS) |
| `/admin-seo` | `AdminSEO` | SEO |
| `/admin-pwa` | `AdminPWA` | PWA |
| `/admin-category-icons` | `AdminCategoryIcons` | Ícones por categoria |
| `/admin-category-order` | `AdminCategoryOrder` | Ordem de categorias |
| `/admin-platforms` | `AdminPlatforms` | Ícones de plataforma |
| `/admin-database` | `AdminDatabase` | Conexão/migração para banco externo |
| `/admin-contact` | `AdminContact` | Contato |
| `/admin-store-frontends` | `AdminStoreFrontends` | Frontends da loja (slug/nome) |
| `/admin-store-sections` | `AdminStoreSections` | Seções da loja |
| `/admin-store-banners` | `AdminStoreBanners` | Banners da loja + menu banners |
| `/admin-store-popups` | `AdminStorePopups` | Popups e hotspots |
| `/admin-store-packages` | `AdminStorePackages` | Pacotes e combos |
| `/admin-store-orders` | `AdminStoreOrders` | Pedidos da loja + ferramentas de reprocessamento |
| `/admin-store-users` | `AdminStoreUsers` | Usuários WhatsApp/PIN + créditos |

---

## 6) Painel SMM (usuário) — funcionalidades

### 6.1 Autenticação (painel)

- Contexto: `src/contexts/AuthContext.tsx`
- Estados: `user`, `session`, `loading`, `isAdmin`
- Estratégia:
  - Listener `onAuthStateChange` mantém sessão sincronizada.
  - `checkAdminRole(userId)` consulta `user_roles`.
  - Ao trocar entre banco padrão/external, o contexto ressincroniza via `clientKey`.

### 6.2 Provedores e serviços

- Provedores (`smm_providers`) definem `api_url` e `api_key`.
- Serviços importados (`imported_services`) armazenam catálogo vindo do provedor.
- Customizações (`service_customizations`) permitem alterar:
  - nome, descrição, preço, min/max, tempo médio
  - habilitar/desabilitar
  - controlar se aparece botão de refill

#### 6.2.1 Fornecedores de API (SMM) — como funciona (Admin)

**Objetivo**: permitir cadastrar **múltiplos provedores** (painéis SMM externos) e fazer com que:

- o sistema consiga **buscar catálogo** (lista de serviços)
- consultar **saldo** do provedor
- criar pedidos e checar status **no provedor correto**

**Tela (Admin)**: `src/pages/AdminProviders.tsx` (menu “Fornecedores”).

**Tabela principal**: `public.smm_providers`

- `name`: nome exibido no admin
- `slug`: gerado automaticamente a partir do nome (função `createSlug`)
- `api_url`: endpoint do provedor (ex.: `https://.../api/v2`)
- `api_key`: chave do provedor
- `is_active`: liga/desliga fornecedor
- `is_default`: marca fornecedor padrão (legado / fallback)

**Regras importantes implementadas**:

1) **Apenas um fornecedor padrão**
   - Ao salvar um fornecedor com `is_default=true`, o sistema faz `update` em todos os outros para `is_default=false`.
   - Implementação: `saveMutation` em `AdminProviders.tsx`.

2) **Saldo do provedor (botão “Saldos/Atualizar Saldos”)**
   - Para cada provedor, o admin chama a função de backend `smm-proxy` com `action: "balance"`, passando `apiUrl` e `key` do provedor.
   - Implementação: `fetchProviderBalance` / `fetchAllBalances` em `AdminProviders.tsx`.
   - Observação: o saldo é exibido na UI e somado em “Saldo APIs” como referência operacional.

3) **Chamada ao provedor sempre via backend do sistema**
   - A função de backend `smm-proxy` é usada como “proxy” para não expor `api_key` no navegador.
   - Isso também garante funcionamento mesmo quando o app está configurado com **banco externo**.
   - Arquivo: `supabase/functions/smm-proxy/index.ts`.

#### 6.2.2 Importação de serviços por categoria (Admin) — selecionar o que importar

**Objetivo**: trazer o catálogo do provedor para dentro do sistema, permitindo:

- **importar serviços específicos** (checkbox por serviço)
- **importar por categoria** (checkbox por categoria)
- **importar em massa** (“Selecionar Todos” / “Limpar”)
- impedir duplicidade: serviços já importados ficam como **Importado** e são desabilitados

**UI (modal)**: `src/components/ServiceImportDialog.tsx`

**Como o modal é aberto**:

- Na lista de fornecedores (`AdminProviders.tsx`), ação de “importar” abre o `ServiceImportDialog` passando o `provider`.

**Fluxo detalhado**:

1) **Buscar catálogo do provedor**
   - Quando o modal abre, o frontend chama `backendSupabase.functions.invoke("smm-proxy")` com:
     - `action: "services"`
     - `key: provider.api_key`
     - `apiUrl: provider.api_url`
   - Implementação: `useQuery(["provider-services", provider?.id])` em `ServiceImportDialog.tsx`.

2) **Ler o que já está importado (para marcar e bloquear duplicados)**
   - O sistema consulta `imported_services` filtrando por `provider_id` e lê `external_service_id`.
   - Isso vira um `Set` (`importedSet`) para:
     - mostrar badge “Importado”
     - desabilitar checkbox
     - evitar inserir duplicado na importação

3) **Agrupar por categoria + busca**
   - O catálogo retornado pelo provedor tem o campo `category`.
   - A UI agrupa em `servicesByCategory` (map `categoria -> serviços`) e exibe em formato “accordion” (expandir/recolher).
   - A busca (`search`) filtra por:
     - nome do serviço
     - nome da categoria
     - ID do serviço (`service`) digitado

4) **Seleção do que importar**
   - `selectedServices` é um `Set<number>` com os IDs externos selecionados.
   - Existem três níveis de seleção:
     - por serviço (checkbox em cada item)
     - por categoria (`toggleCategoryServices` seleciona todos não-importados daquela categoria)
     - global (“Selecionar Todos” / “Limpar”)

5) **Importar (gravar no banco)**
   - Ao clicar “Importar o(s) Serviço(s)”, o sistema:
     - revalida duplicados consultando o banco novamente (defensivo)
     - monta `insertData` com os campos do catálogo
     - faz `insert` em `imported_services`
   - Implementação: `importMutation` em `ServiceImportDialog.tsx`.
   - Observação importante: usa **insert** (não `upsert`) para manter compatibilidade com bancos externos onde pode não existir `unique` no schema.

**Tabela gravada**: `public.imported_services`

- `provider_id`: FK para o provedor
- `external_service_id`: ID do serviço no provedor
- `name`, `category`, `type`, `rate`, `min`, `max`
- `refill`, `cancel`, `dripfeed`, `description`, `average_time`
- `is_active=true` por padrão no momento da importação

#### 6.2.3 Como o pedido usa o provedor correto (pós-importação)

Quando o usuário cria um pedido no painel, o sistema **não usa mais “um único provedor”**; ele resolve o provedor com base no serviço importado:

1) Busca em `imported_services` qual `provider_id` atende aquele `external_service_id`.
2) Busca em `smm_providers` as credenciais (`api_key`, `api_url`).
3) Chama `smm-proxy` com `action: "add"` e encaminha o pedido ao provedor correto.

Implementação: `createOrder(...)` em `src/lib/api.ts`.

**Observação (mapeamento avançado de ID)**:

- O campo opcional `internal_provider_service_id` (quando existe no schema) permite “mapear” um serviço importado para um ID diferente no provedor.
- O código do `createOrder` faz fallback automaticamente caso essa coluna não exista (compatibilidade com bancos externos desatualizados).

#### 6.2.4 Sincronização (atualização) dos serviços importados

Além da importação manual, existe uma rotina de sincronização que **atualiza os dados dos serviços já importados** (preço/min/max/nome etc.) conforme o provedor:

- Função de backend: `sync-services` (`supabase/functions/sync-services/index.ts`)
- Comportamento:
  - busca todos os `smm_providers` ativos
  - consulta o catálogo no provedor
  - **atualiza apenas os serviços que já existem** em `imported_services` (não importa novos automaticamente)
  - atualiza campos como `name`, `rate`, `min`, `max`, `category`, `type`, flags e metadados

Isso é útil para manter o catálogo consistente quando o provedor muda preços/limites.

### 6.3 Serviços (Admin) — editar serviço e “popup de edição”

**Objetivo**: permitir ao admin **personalizar** como um serviço aparece no painel/loja (nome, descrição, preço, min/máx, visibilidade, botão de refill) sem destruir o histórico e sem perder o ID externo.

**Tela**: `src/pages/AdminServices.tsx` (rota `/admin-services`).

**Popup/Modal de edição**: `src/components/ServiceEditDialog.tsx`.

#### 6.3.1 De onde vêm os serviços que aparecem na tela

- A lista exibida no admin é baseada em `public.imported_services` (catálogo importado dos fornecedores).
- As “personalizações” ficam separadas em `public.service_customizations`.
- A UI combina as duas fontes com `getDisplayData(...)`:
  - `custom_name` sobrescreve `imported_services.name`
  - `custom_description` sobrescreve `imported_services.description`
  - `custom_rate` sobrescreve `imported_services.rate`
  - `custom_min/custom_max` sobrescrevem `imported_services.min/max`
  - `is_active=false` oculta o serviço nas telas (quando o filtro “Mostrar inativos” não está ligado)
  - `show_refill_button=false` desliga a opção de refill para o usuário

#### 6.3.2 Como abrir o popup

- Cada item de serviço tem um botão de edição (ícone “lápis”).
- Ao clicar, `AdminServices.tsx` monta um objeto `Service` a partir do registro de `imported_services` e abre o modal:
  - `service` (dados-base)
  - `customization` (se existir)
  - `importedServiceId` (id do registro em `imported_services`)
  - `currentInternalServiceId` (campo `internal_provider_service_id`, quando existe)

Implementação: função `handleEdit(...)` em `AdminServices.tsx`.

#### 6.3.3 O que deve ter no popup (como está hoje)

O `ServiceEditDialog` é um modal com scroll e inclui, **nesta ordem**:

1) **Cabeçalho**
   - Título: `Editar Serviço #<id>`
   - Subtítulo: “Deixe em branco para usar os valores originais.”

2) **Bloco “Informações originais” (somente leitura)**
   - Nome original (`service.name`)
   - Preço original (`service.rate`) formatado por 1K
   - (Opcional) “Serviço interno atual” quando `currentInternalServiceId` existe
     - Explica que o cliente compra o ID externo, mas internamente pode usar outro ID.

3) **Seção recolhível: “Alterar Provedor/Serviço” (avançado)**
   - Serve para trocar o **provedor/serviço interno** usado no envio de pedidos **sem mudar o ID externo do serviço**.
   - Campos:
     - Select “Selecionar Provedor” (lista de `smm_providers` ativos)
     - Campo “Buscar Serviço” (filtra por nome, ID e categoria)
     - Lista dos serviços do provedor (carregados via `smm-proxy action=services`, com limite visual de 50 itens)
     - Card de confirmação do “Novo serviço selecionado”
   - Ao salvar neste modo:
     - atualiza `imported_services.provider_id` para o novo provedor
     - grava o ID do serviço do novo provedor em `imported_services.internal_provider_service_id` (quando a coluna existe)
     - atualiza `rate/min/max` com os valores do novo serviço interno
     - **preserva** `external_service_id`, nome e categoria (integridade histórica)

4) **Campos de personalização (opcionais)**
   - **Nome personalizado** (`custom_name`) — se vazio, usa o original
   - **Quantidade mínima** (`custom_min`) + label “Original: …”
   - **Quantidade máxima** (`custom_max`) + label “Original: …”
   - **Descrição** (`custom_description`) com botão:
     - “Gerar com IA” → chama `generate-service-description`
   - **Preço personalizado (por 1K)** (`custom_rate`)
   - **Tempo médio** (`custom_average_time`)

5) **Toggles (chaves)**
   - **Mostrar botão de reposição** (`show_refill_button`)
   - **Serviço ativo** (`is_active`) — desativar oculta o serviço

6) **Rodapé**
   - Botão “Cancelar”
   - Botão “Salvar” (ou “Alterar Serviço” quando selecionou novo serviço interno)

#### 6.3.4 Geração de descrição com IA (dentro do popup)

- Botão: “Gerar com IA”
- Função de backend: `generate-service-description` (`supabase/functions/generate-service-description/index.ts`)
- Entrada:
  - `serviceName` (nome atual: personalizado se existir, senão original)
  - `category`
- Saída:
  - `description` com formato fixo e regras rígidas (não inventar dados)

#### 6.3.5 Onde os dados são salvos

1) **Personalizações normais** → tabela `service_customizations`
   - `update` se já existir registro
   - `insert` se não existir
   - Compatibilidade com banco externo: se colunas `custom_min/custom_max` não existirem ainda, o sistema salva “parcialmente” sem elas e mostra aviso.

2) **Alterar Provedor/Serviço (interno)** → tabela `imported_services`
   - Atualiza `provider_id`, `internal_provider_service_id` (se existir), `rate/min/max` e `updated_at`.
   - Mantém `external_service_id` para preservar histórico e referências.

### 6.3 Pedidos (painel)

- Tabela: `orders`
- Criação de pedido:
  - `src/lib/api.ts` → `createOrder(...)`
  - Resolve qual provedor atende aquele serviço e chama `smm-proxy` (função backend).
- Status:
  - Consulta via `status` no provedor (função backend) e sincroniza na UI.

### 6.4 Tickets de suporte

- Tabelas: `support_tickets` e `ticket_messages`
- UI:
  - `Support.tsx` cria ticket
  - `TicketChatPage.tsx` exibe chat
  - `TicketChat.tsx` controla mensagens
- IA:
  - Função `ai-ticket-response` pode gerar resposta sugerida.

---

## 7) Loja (/loja) — funcionalidades (checkout + tracking)

### 7.1 Página principal da loja

- Página: `src/pages/StoreFront.tsx`
- Carrega:
  - `store_frontends` pelo slug
  - `store_package_sections` (seções)
  - `store_packages` ativos (exceto `hidden_from_storefront=true`)
  - `store_banners` (grid de banners)
  - `store_menu_banners` (banners no menu lateral)
- UI:
  - Menu lateral (Sheet) com atalhos (Pacotes/Consultar Pedido/Instagram/WhatsApp)
  - “Consultar Pedido” abre `OrderLookupModal`

### 7.2 Popups com hotspots (marketing)

- Componentes:
  - `src/components/store/StorePopupModal.tsx` (exibição)
  - `src/components/store/HotspotImageEditor.tsx` (admin, edição)
- Tabelas:
  - `store_popups` (imagem, janela, frequência, delay, prioridade)
  - `store_popup_hotspots` (áreas clicáveis percentuais)
- Frequência:
  - `always`
  - `once_per_visitor` (TTL em horas)
  - `once_per_day`

### 7.3 Pacotes e combos

- Tabela: `store_packages`
- Tipos:
  - `single` (um serviço)
  - `combo` (vários serviços/itens)
- Campos relevantes:
  - `default_link_fields` (quantos campos de link em single)
  - `predefined_quantities` (quantidades/valores fixos; pode conter `link_fields`)
  - `combo_items` (itens do combo com `service_id`, `quantity`, `links_count`, `link_label`)
  - `link_tutorial_rules` (regras exibidas no tutorial do checkout)
  - `hidden_from_storefront` (oculta sem desativar)

### 7.4 Modal de compra (PurchaseModal)

- Arquivo: `src/components/store/PurchaseModal.tsx`
- Estado por etapas (ex.): `phone → link → payment → success`

#### 7.4.1 Auth do cliente da loja (WhatsApp + PIN)

- Funções frontend: `src/lib/storeCustomerAuth.ts`
- Função backend: `store-customer-auth`
- Tabelas:
  - `store_customers` (PIN com hash PBKDF2 + salt)
  - `store_customer_sessions` (token_hash + expires_at)

Sessões:

- Para compra, o modal pode **manter sessão** para facilitar o checkout.
- Para consulta de pedido (OrderLookup), o sistema **exige PIN sempre** (não reutiliza sessão automaticamente).

#### 7.4.2 Validações e qualidade do pedido

- Anti‑duplicidade:
  - Função backend: `store-order-duplicate-check`
  - Bloqueia compra quando há pedido ativo para o mesmo link+serviço.

- Regras de link:
  - Instagram: validações específicas (reel/post/perfil, etc.)
  - TikTok: resolve links curtos (`vt.tiktok.com`/`vm.tiktok.com`) via `tiktok-resolve` e exige `/video/`.

- Multi‑link:
  - Para pacotes single com múltiplos campos, o sistema distribui a quantidade total entre links.

#### 7.4.3 Pagamento PIX

- Função backend: `mercadopago-pix`
- O modal gera QRCode/copia‑e‑cola e acompanha status.

##### 7.4.3.1 Instalação / configuração do Mercado Pago (para PIX)

> **Objetivo**: habilitar o sistema a **criar pagamentos PIX** e **confirmar automaticamente** quando o pagamento for aprovado.

**Pré‑requisitos**

1) Ter uma conta Mercado Pago (Pessoa Física ou Jurídica) com **PIX habilitado**.
2) Criar um aplicativo/credenciais no Mercado Pago e obter o **Access Token** (credencial privada).
3) Cadastrar o **Access Token** no backend do projeto como segredo:
   - **Nome do segredo**: `MERCADOPAGO_ACCESS_TOKEN`
   - **Onde é usado**: funções backend `mercadopago-pix` e `mercadopago-webhook`.

**Importante (segurança)**

- O Access Token **nunca** fica no frontend.
- A tela `MercadoPagoSettings` é apenas informativa/administrativa; na prática o sistema prioriza o token configurado no backend.

##### 7.4.3.2 Fluxo completo “Gerar PIX” (checkout → pagamento → aprovação)

O fluxo é desenhado para ser **idempotente** e **race‑safe** (evita duplicidade / corrida entre polling e webhook).

**(A) Checkout cria pedido pendente**

1) O usuário escolhe um pacote e preenche telefone + links.
2) O frontend cria um registro em `store_orders` com:
   - `payment_status = 'pending'`
   - `order_status = 'pending'`
   - `phone`, `package_id`, `link`, `quantity`, `total_price`, `order_payload`.

**(B) Criar pagamento PIX no Mercado Pago**

3) O frontend chama a função backend `mercadopago-pix` (ação padrão: **criar pagamento**) enviando:
   - `amount` (valor)
   - `description`
   - `email` (opcional)
   - `order_id` (id do `store_orders`)
   - `phone` e `package_id` (para persistir intent; ver item E)

4) A função `mercadopago-pix` cria o pagamento via API do Mercado Pago (`POST /v1/payments`) com:
   - `payment_method_id: "pix"`
   - `transaction_amount`
   - `external_reference` = `order_id` (e também `metadata.order_id`)
   - `notification_url` apontando para a função backend `mercadopago-webhook` (URL pública)

5) A função retorna para o frontend os dados necessários para exibir o PIX:
   - `qr_code` (copia‑e‑cola)
   - `qr_code_base64` (imagem)
   - `ticket_url` (quando disponível)
   - `payment_id` (id do pagamento no Mercado Pago)

6) O frontend salva o `payment_id` no pedido (`store_orders.payment_id`).

**(C) Confirmação automática (Webhook)**

7) Quando o pagamento muda de status, o Mercado Pago chama a `notification_url`.
8) A função `mercadopago-webhook`:
   - extrai `paymentId` do payload/query
   - consulta a API do Mercado Pago (`GET /v1/payments/{id}`) para validar o status real
   - quando `status === 'approved'`, tenta localizar o pedido:
     - por `store_orders.payment_id` (preferencial)
     - ou por `external_reference`/`metadata.order_id` (corrige corrida quando o pedido ainda não salvou `payment_id`)
   - faz um **update atômico**: só muda `payment_status` para `approved` se ainda estiver `pending`
   - dispara `store-order-process` para processar/entregar o pedido.

**(D) Plano B (polling de status)**

9) Enquanto o usuário está na tela de pagamento (e também no `OrderLookupModal`), o frontend pode chamar:
   - `mercadopago-pix` com `action: "check_status"` e `payment_id`
10) Se o status vier `approved`, a própria `mercadopago-pix` também tenta:
   - aprovar `payment_status` de forma atômica e disparar `store-order-process`.

**(E) Pagamento tardio (pedido deletado) → crédito automático**

11) Ao criar o PIX, a `mercadopago-pix` faz um best‑effort de persistência em `store_payment_intents`.
12) Se um pedido pendente for apagado e o pagamento aprovar depois, a `mercadopago-webhook`:
   - procura o intent por `payment_id`
   - cria um registro em `store_package_credits` (idempotente por `source_payment_id`)
   - permitindo que o cliente use o crédito posteriormente.

##### 7.4.3.3 Reabrir PIX (reutilizar QRCode de um pagamento existente)

Quando o usuário fecha o navegador e quer “pegar o QRCode de novo”:

- O sistema chama `mercadopago-pix` com `action: "get_qr"` e `payment_id`.
- A função busca em `GET /v1/payments/{id}` e devolve `qr_code`, `qr_code_base64`, `ticket_url` e `expiration_date`.

##### 7.4.3.4 Funções backend envolvidas (resumo)

- `mercadopago-pix`
  - cria pagamento PIX
  - `check_status` (polling)
  - `get_qr` (reabrir PIX)
  - registra `store_payment_intents` (best‑effort)

- `mercadopago-webhook`
  - valida pagamento consultando a API do Mercado Pago
  - aprova pedido de forma atômica (evita duplicidade)
  - dispara `store-order-process`
  - cria `store_package_credits` em caso de pagamento tardio

- `mercadopago-reconcile`
  - fallback manual (admin) para revalidar pagamentos recentes quando webhooks falham

#### 7.4.4 Fechar o popup no mobile

- O modal possui botão explícito de fechar (X), útil em mobile quando clique fora/ESC estão bloqueados.

### 7.5 Pedidos da loja e processamento

- Tabela: `store_orders`
- Criação de pedido:
  - Insere registro “pendente” (payment_status/order_status)
  - Ao aprovar pagamento, chama `store-order-process` para enviar ao provedor.

#### 7.5.1 Reabrir QRCode de pedido pendente

- `OrderLookupModal` pode abrir novamente o PIX de pedidos pendentes.
- Usa `mercadopago-pix` com `action: get_qr`.

#### 7.5.2 Sincronização de status

- Função backend: `store-order-process` possui ação `sync_all_processing`.
- Admin e usuário executam sync com throttling para evitar excesso de chamadas.

---

## 8) Créditos por reembolso (loja)

### 8.1 Conceito

Quando um pedido gera crédito (reembolso/ajuste), o cliente pode criar um pedido “R$0” consumindo créditos **por serviço**.

### 8.2 Implementação

- Tabela: `store_customer_credits` (`service_id` + `quantity_remaining`)
- Função backend: `store-customer-credits`
  - `action: list` → lista saldo por serviço
  - `action: redeem` → consome FIFO e cria pedido com `total_price=0`

### 8.3 UX (OrderLookupModal)

- Modal exibe seção “CRÉDITOS DISPONÍVEIS” quando houver.
- Quantidade para resgate é propositalmente “travada” para consumir o saldo integral daquele serviço.

---

## 9) Sistema de “crédito por pagamento tardio” (loja)

### 9.1 Problema

Pedidos pendentes podem ser limpos do sistema, mas o pagamento pode aprovar depois.

### 9.2 Implementação

- Tabelas:
  - `store_payment_intents` (mantém referência do pagamento)
  - `store_package_credits` (gera crédito monetário vinculado a pacote)

---

## 10) Admin — Loja (operações avançadas)

### 10.1 AdminStoreOrders (painel de pedidos da loja)

- Página: `src/pages/AdminStoreOrders.tsx`
- Recursos:
  - Filtros (status/pagamento), busca por link/telefone, paginação
  - **Limpar pendentes**
  - **Atualizar status** (sync backend)
  - Override manual de `order_status`
  - **Reenviar**: reinicia um pedido pago com erro/falha e chama `store-order-process` novamente.

### 10.2 AdminStoreUsers

- Gestão de usuários WhatsApp (cadastro, notas, reset de PIN)
- Gestão/visualização de créditos por serviço

---

## 11) White‑Label / Migração para banco externo (com validação)

Página: `src/pages/AdminDatabase.tsx`.

### 11.1 O que essa tela faz

- Salva credenciais do banco externo em:
  1) armazenamento local (para uso imediato)
  2) tabela `external_database_configs` (backup server‑side)

### 11.2 Fluxo recomendado (seguro)

1) Configurar URL + Anon Key + Service Role Key do banco externo.
2) Rodar o script SQL (schema) no banco externo.
3) **Criar/garantir o admin** no externo (mesmo e‑mail) com a senha padrão definida.
4) Exportar backup do banco atual.
5) Importar backup no externo.
6) Validar login do admin no externo.
7) Só então “virar a chave” e operar no banco externo.

### 11.3 Observação crítica: senha do admin

Por segurança, **senhas não são exportáveis** como texto e não podem ser “migradas” como estavam.

Portanto, a garantia de acesso é:

- **Criar/forçar a conta do admin no banco externo com uma senha definida por você na migração**.

---

## 12) Funções do backend (lista e responsabilidades)

> Observação: funções são chamadas via `backendSupabase.functions.invoke(...)`.

| Função | Responsabilidade |
|---|---|
| `smm-proxy` | Proxy para APIs de provedor (services/balance/add/status/refill) |
| `sync-services` | Import/sync do catálogo de serviços |
| `generate-service-description` | Geração de descrição de serviço via IA |
| `seo-generate` | Geração de conteúdo/meta SEO via IA |
| `ai-ticket-response` | Sugestão/resposta de tickets via IA |
| `mercadopago-pix` | Criar PIX, checar status, obter QR, webhook |
| `mercadopago-webhook` | Webhook de confirmação de pagamento |
| `mercadopago-reconcile` | Revalidação manual de pagamentos recentes |
| `store-order-process` | Processa pedido pago, cria pedidos no provedor, sincroniza status |
| `store-order-duplicate-check` | Anti‑duplicidade por link+serviço |
| `store-customer-auth` | Auth loja (WhatsApp+PIN) e admin_set_pin |
| `store-customer-credits` | Listagem e resgate de créditos por serviço |
| `store-package-credits` | Fluxo de crédito monetário (pagamento tardio) |
| `storage-upload` | Upload de assets (compatível com banco externo) |
| `backup-export` | Export de dados para migração |
| `backup-import` | Import de dados para migração |
| `export-schema` | Export do schema |
| `setup-database` | Auxílio/setup do schema (quando aplicável) |
| `admin-clean` | Limpeza/zeragem operacional |
| `create-admin` | Criação de admin inicial |
| `tiktok-resolve` | Resolve link curto do TikTok |

---

## 13) Tabelas (resumo funcional)

> A listagem abaixo resume “para que serve” (a estrutura exata está nos tipos do backend).

### 13.1 Painel

- `profiles`: perfil do usuário do painel (saldo, nome, telefone)
- `user_roles`: papéis (admin/moderator/user)
- `smm_providers`: provedores e chaves
- `imported_services`: catálogo importado
- `service_customizations`: overrides (nome/preço/descrição)
- `orders`: pedidos do painel
- `refills`: refill do painel
- `balance_history`: histórico de depósitos
- `support_tickets` + `ticket_messages`: suporte
- `api_keys`: API keys do usuário (integrações)

### 13.2 Conteúdo/SEO

- `landing_content`: CMS da landing
- `site_settings`: SEO + contatos + parâmetros gerais
- `terms_content` / `privacy_content`: conteúdo legal
- `seo_actions`, `ai_agents`, `ai_providers`: automações via IA

### 13.3 Loja

- `store_frontends`: “lojas” por slug
- `store_package_sections`: seções da vitrine
- `store_packages`: pacotes e combos
- `store_orders`: pedidos da loja
- `store_banners`: banners na vitrine
- `store_menu_banners`: banners no menu lateral
- `store_popups` + `store_popup_hotspots`: popups e hotspots
- `store_order_links`: índice de links normalizados para anti‑duplicidade
- `store_customers` + `store_customer_sessions`: auth WhatsApp/PIN
- `store_customer_credits`: créditos por serviço
- `store_payment_intents` + `store_package_credits`: crédito por pagamento tardio

### 13.4 White‑Label

- `external_database_configs`: backup server‑side das credenciais do banco externo

---

## 14) Componentes principais (por área)

### 14.1 Infra e layout

- `src/components/AppLayout.tsx`, `AppSidebar.tsx`, `MobileBottomNav.tsx`
- `src/components/AdminLayout.tsx`, `AdminSidebar.tsx`
- `src/components/ProtectedRoute.tsx`, `AdminRoute.tsx`
- `src/components/SEOHead.tsx`
- `src/components/AppErrorBoundary.tsx`

### 14.2 Loja

- `PackageCard.tsx` (card do pacote)
- `PurchaseModal.tsx` (checkout)
- `OrderLookupModal.tsx` (consulta de pedidos + créditos + reabrir PIX)
- `StoreBannerGrid.tsx` (banners)
- `StorePopupModal.tsx` (popups)
- `HotspotImageEditor.tsx` (admin popups)

---

## 15) Observações de manutenção

- Alterações no banco externo podem ficar “atrasadas” (colunas novas). O app implementa fallback para algumas leituras (ex.: `site_settings` na landing).
- Evitar logs de dados sensíveis em produção.
- Funções de backend grandes (ex.: `store-customer-auth`, `store-customer-credits`) devem ser mantidas legíveis; qualquer crescimento grande merece refatoração.

---

*Última atualização deste documento: Janeiro/2026 (revisado e alinhado ao código atual).* 
