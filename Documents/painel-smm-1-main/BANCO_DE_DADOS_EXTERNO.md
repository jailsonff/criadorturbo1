# BANCO DE DADOS EXTERNO (White‑label / Isolamento por Cliente)

Este documento explica **como configurar um banco de dados externo** (um projeto próprio) para que o sistema salve e leia informações desse banco, e **como isso está implementado** no código.

> Objetivo: permitir que cada cliente/instância use **seu próprio backend** (URL + Anon Key), mantendo a aplicação web a mesma.

---

## 1) Visão geral: como funciona

O sistema foi desenhado com um **cliente de banco dinâmico**:

- **Se NÃO houver configuração externa**, o app usa o backend padrão do projeto.
- **Se houver configuração externa**, o app passa a apontar as leituras/escritas de banco para o **projeto externo** do cliente.

Na prática:

1. O usuário informa:
   - **URL do projeto** (ex.: `https://xxxx.supabase.co`)
   - **Anon Key** (chave pública)
   - (Opcional para operações administrativas do setup) **Service Role Key**
2. O app salva essas credenciais.
3. O app recria o cliente e passa a operar no banco externo.

---

## 2) Onde o usuário configura (tela de Setup Inicial)

A tela responsável por coletar as credenciais e finalizar a configuração é:

- `src/pages/InitialSetup.tsx`

Ela faz duas coisas principais:

### 2.1) Coleta as credenciais

- URL do projeto
- Anon Key
- Service Role Key

### 2.2) Cria um Admin padrão no banco externo

Para o usuário não “se trancar para fora” do painel administrativo, o setup:

- cria (ou verifica) o usuário `admin@admin.com`
- garante role `admin` (na tabela `user_roles`)
- garante o registro de `profiles`

Isso é feito usando um cliente criado com **Service Role Key** (permite operações administrativas de Auth).

> Observação: Service Role Key é **sensível**; idealmente este passo seria feito por uma função de backend, mas aqui foi implementado no frontend para facilitar o onboarding. Use com cuidado e somente em ambientes controlados.

---

## 3) Como o app “troca” de banco (implementação)

O coração do recurso é:

- `src/lib/supabaseClient.ts`

Esse arquivo implementa um **Supabase client dinâmico**:

### 3.1) Onde a configuração fica salva

- Chave no storage do navegador: `supabase_config`

Funções principais:

- `getExternalConfig()` → lê e valida `{ url, anonKey, serviceRoleKey? }`
- `hasExternalDatabase()` → diz se existe banco externo configurado
- `setExternalConfig(config)` → salva e força recarregar o client
- `clearExternalConfig()` → remove e volta para o banco padrão
- `refreshSupabaseClient()` → limpa cache e recria o client

### 3.2) Cache do client

Para evitar recriar o client o tempo todo, o módulo mantém cache em memória:

- `cachedClient`
- `cachedConfigHash`

Quando muda `url` ou `anonKey`, o hash muda e o client é recriado.

### 3.3) Storage “defensivo”

Em alguns dispositivos/navegadores (ex.: modo anônimo), `localStorage` pode falhar.
Para isso existe:

- `src/lib/safeStorage.ts`

Ele fornece um armazenamento seguro (cai para memória caso o storage real não funcione).

---

## 4) Ponto importante: banco externo x funções do backend

Há dois “tipos” de cliente no projeto:

### 4.1) Cliente dinâmico (para dados)

Use para **SELECT/INSERT/UPDATE/DELETE** no banco:

- `getSupabaseClient()` (em `src/lib/supabaseClient.ts`)

Este é o cliente que pode apontar para o **banco externo**.

### 4.2) Cliente fixo do backend (para chamar funções)

Use para chamar **funções do backend** (invoke), independente do banco externo:

- `src/lib/backendClient.ts` exporta `backendSupabase`

Esse cliente sempre aponta para o backend “interno” do projeto e serve para:

- `backendSupabase.functions.invoke("...")`

> Regra prática: **dados → client dinâmico**; **funções → backendSupabase**.

---

## 5) Como “instalar” o banco externo (passo a passo do usuário)

### Passo 1 — Criar/ter um projeto externo

O usuário deve ter um projeto externo compatível (com a mesma estrutura de tabelas usada pelo sistema).

### Passo 2 — Garantir o schema (tabelas, funções e políticas)

O banco externo precisa conter as mesmas tabelas e rotinas do sistema.
Sem isso, telas irão falhar ao ler/escrever dados.

No projeto existe uma função de backend em:

- `supabase/functions/setup-database/index.ts`

Ela **não executa SQL automaticamente no projeto externo** (limitação de segurança). Em vez disso, ela retorna instruções para o usuário executar o script SQL manualmente no ambiente do banco externo.

> Em resumo: você precisa **aplicar o script de criação de tabelas/políticas** no banco externo antes de apontar o app para ele.

---

## 5.1) O que é o botão “Copiar Script SQL” (e por que ele existe)

Quando você está na tela administrativa de banco (ex.: rota `/admin-database`), o sistema oferece opções como **“Copiar Script SQL”** e **“Baixar Arquivo .sql”**.

### Para que serve

Esse script é o **pacote completo de instalação do schema** do sistema no banco externo, ou seja, ele inclui (de forma agrupada):

- **Tabelas** necessárias para o painel e/ou loja pública;
- **Funções** (ex.: normalização de links, helpers de permissão);
- **Políticas de segurança (RLS)** para impedir exposição de dados;
- **Triggers/rotinas** quando necessárias (ex.: `updated_at`, normalização, sync);
- (Em alguns cenários) **conteúdo inicial**: textos padrão de Landing/SEO/Termos/Privacidade e configurações base.

> Sem aplicar esse script, o banco externo fica “vazio” ou “incompleto” e o app vai falhar ao tentar ler/gravar dados.

### Por que é manual (e não automático)

Mesmo tendo URL + chaves do projeto externo, por segurança o backend **não executa SQL remoto automaticamente** no banco do cliente.
Isso evita:

- execução acidental de comandos destrutivos;
- risco de alguém colar uma URL maliciosa e forçar execução;
- problemas de auditoria/controle do que foi aplicado.

Por isso, o fluxo correto é: **o sistema gera o script** e **o cliente aplica manualmente** no ambiente do banco externo.

---

## 5.2) Como o script SQL é “montado” (implementação)

O script não é “digitado à mão” no painel; ele é **gerado a partir do “source of truth” do schema do projeto**.

### Fonte de verdade do schema

O projeto mantém definições de schema em código (para suportar white‑label e validação):

- `src/lib/databaseSchema.ts` → define as tabelas/colunas/índices esperados
- `src/lib/schemaSync.ts` → mantém um registro central (ex.: `TABLE_REGISTRY`) e utilitários para comparar/gerar schema

O botão “Copiar Script SQL” usa essa base para entregar um script consistente com a versão atual do app.

### O que a função `setup-database` faz de verdade

A função em `supabase/functions/setup-database/index.ts` **não aplica** SQL no banco externo.
Ela:

1) valida parâmetros (URL, Service Role, schema);
2) testa conectividade básica;
3) retorna `requiresManualSetup: true` e instruções.

Ou seja: ela funciona como um **assistente guiado** que explica o processo e impede que o usuário ache que “já está tudo instalado”.

---

## 5.3) Passo a passo: aplicar o script no banco externo (instalação)

1) Gere o script no painel: **Copiar Script SQL** (ou **Baixar Arquivo .sql**)
2) Abra o editor SQL do projeto externo
3) Cole o script e execute
4) Volte no app e use **Testar Conexão** (quando existir)
5) Somente depois disso finalize a troca para o banco externo

---

## 5.4) Regra crítica: toda alteração de schema exige atualizar o script no banco externo

Sempre que o app ganhar ou mudar alguma estrutura de dados, o banco externo precisa acompanhar.
Exemplos comuns:

- nova tabela (ex.: logs, recursos de loja, novos campos);
- nova coluna/índice;
- ajuste em RLS/políticas;
- nova função/trigger usada pelo app.

### O que fazer quando houver mudança

1) Atualize o projeto (código + backend)
2) Gere novamente o script (ou o script de atualização)
3) Aplique no banco externo **antes** de colocar usuários para usarem a nova versão

### O que acontece se não atualizar

- páginas quebram com erros “coluna não existe”, “tabela não existe”, “função não existe”;
- inserts/updates falham por políticas RLS incompatíveis;
- comportamento inconsistente entre instâncias.

> Recomendação prática: trate o banco externo como um “deploy paralelo” do backend. **Código novo exige schema novo**.

### Passo 3 — Pegar as credenciais

No projeto externo, obtenha:

- **Project URL**
- **Anon public key**
- **Service Role key** (somente para o passo de criação do Admin; evite manter essa chave exposta)

### Passo 4 — Informar na tela de Setup Inicial

Acesse a tela de configuração e cole:

1) URL
2) Anon Key
3) Service Role Key

Clique para finalizar.

### Passo 5 — Confirmar que o app está usando o banco externo

Após salvar, o app dispara o evento:

- `window.dispatchEvent(new Event("supabase-config-changed"))`

E o client passa a apontar para o projeto externo.

---

## 6) Segurança (o que é obrigatório)

### 6.1) RLS e políticas

O banco externo deve ter **Row Level Security (RLS)** habilitado e com políticas compatíveis.
Sem isso:

- dados podem ficar expostos
- inserts/updates podem falhar por falta de permissão

### 6.2) Roles em tabela separada

As permissões administrativas devem ser controladas via tabela separada (ex.: `user_roles`) e função `has_role(...)`.
Não armazene roles em `profiles`/`users` via client.

---

## 7) Limitações atuais / pontos de atenção

1) **Service Role Key no navegador**: é um risco por ser uma chave privilegiada. Idealmente, a criação do admin e qualquer operação sensível deveria ocorrer via backend.

2) **Execução automática de SQL no banco externo**: a função `setup-database` não consegue “rodar SQL remoto” diretamente. O usuário precisa aplicar o schema manualmente.

3) **Consistência do schema**: se o banco externo estiver desatualizado (faltando colunas/tabelas), partes do app podem quebrar.

---

## 10) Anexo: guia completo do Script SQL

Para um guia mais detalhado (incluindo “o que entra no script”, “como versionar” e “como atualizar com segurança”), veja:

- `BANCO_EXTERNO_SCRIPT_SQL.md`

---

## 8) Checklist rápido

- [ ] Banco externo criado
- [ ] Script/schema aplicado (tabelas + funções + RLS)
- [ ] Credenciais coletadas (URL + Anon Key)
- [ ] Admin criado e com role `admin`
- [ ] App apontando para o banco externo (setup concluído)

---

## 9) Referências no código

- Setup UI: `src/pages/InitialSetup.tsx`
- Client dinâmico: `src/lib/supabaseClient.ts`
- Storage seguro: `src/lib/safeStorage.ts`
- Client fixo para funções: `src/lib/backendClient.ts`
- Função backend (instruções de setup): `supabase/functions/setup-database/index.ts`
