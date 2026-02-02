# BANCO EXTERNO — Script SQL (Instalação, Atualização e Versionamento)

Este documento detalha a funcionalidade do **Script SQL** usado para instalar/atualizar o **schema do sistema** em um **banco de dados externo** (white‑label).

> Objetivo: garantir que o banco externo tenha **as mesmas tabelas, funções e políticas** que a aplicação espera, evitando erros e inconsistências.

---

## 1) O que o Script SQL contém

O Script SQL é a “instalação completa” do backend no banco externo. Em geral ele pode incluir:

### 1.1) Estruturas de dados
- `CREATE TABLE ...` (tabelas)
- `ALTER TABLE ...` (colunas, defaults, constraints)
- `CREATE INDEX ...` (índices para performance)

### 1.2) Segurança (obrigatório)
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (RLS)
- `CREATE POLICY ...` (políticas por operação: SELECT/INSERT/UPDATE/DELETE)

### 1.3) Funções e triggers
- Funções auxiliares (ex.: normalização, helpers de permissão)
- Triggers para manutenção automática (ex.: `updated_at`)

### 1.4) Seed inicial (quando aplicável)
Em alguns cenários o script também inclui **dados base** (conteúdo padrão e configurações iniciais) para:

- Landing page
- SEO
- Termos e Privacidade
- Provedores/recursos auxiliares

> Importante: “seed” é opcional dependendo do fluxo. Estruturas + RLS quase sempre são obrigatórios.

---

## 2) Por que precisa ser aplicado manualmente

O sistema não executa SQL automaticamente no banco do cliente por razões de segurança:

- evita execução remota não auditada;
- evita risco de comandos destrutivos;
- dá ao cliente controle total do que vai para o banco.

Por isso o fluxo correto é: **gerar o script no painel → executar no banco externo → testar conexão**.

---

## 3) Quando devo rodar o Script SQL

### 3.1) Primeira instalação
Você deve rodar o script **antes** de apontar o app para o banco externo.

### 3.2) A cada atualização do sistema (regra)
Sempre que houver mudança de schema no projeto (novas tabelas/colunas/políticas/funções), o banco externo precisa ser atualizado.

Sinais típicos de schema desatualizado:
- erro “relation does not exist” (tabela não existe)
- erro “column does not exist” (coluna não existe)
- erro “function does not exist”
- inserts/updates falhando por RLS/políticas

---

## 4) Como o script é gerado (source of truth)

O projeto mantém o schema esperado como **fonte de verdade** em código. Os principais pontos são:

- `src/lib/databaseSchema.ts`: define o schema esperado
- `src/lib/schemaSync.ts`: registro e utilitários (ex.: `TABLE_REGISTRY`) para comparação/geração

O botão **“Copiar Script SQL”** e/ou o download do `.sql` usa essa base para montar o script conforme a versão atual da aplicação.

---

## 5) Boas práticas de atualização (evitar downtime)

1) **Atualize primeiro o banco externo** (aplique script)
2) Só depois atualize/ponha em produção a versão do app que depende do novo schema
3) Se possível, mantenha mudanças **retrocompatíveis** (ex.: novas colunas opcionais)
4) Faça **backup** antes de scripts grandes

---

## 6) “Instalar” vs “Atualizar”: entendimento importante

- **Instalar**: criar tudo do zero (primeira vez)
- **Atualizar**: aplicar mudanças incrementais

Se o script atual for “full install” (com `CREATE TABLE`), rodar em banco que já tem tabelas pode falhar.
Nesse caso, o recomendado é:

- usar scripts de update idempotentes (ex.: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`), **ou**
- gerar um script “delta” quando a ferramenta suportar.

> Se hoje o seu fluxo gera apenas “install completo”, a orientação é: usar em banco vazio; para bancos já existentes, aplicar updates com cuidado (ou gerar scripts específicos de upgrade).

---

## 7) Checklist rápido (operacional)

- [ ] Gere o script (Copiar/Download)
- [ ] Execute no banco externo
- [ ] Confirme que tabelas + RLS foram criados
- [ ] Teste a conexão no app
- [ ] Só depois finalize o uso do banco externo
