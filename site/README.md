# Site do Bot Especialista em Comentários

Este diretório contém o código-fonte do site web do Bot Especialista em Comentários para Instagram.

- Cores: Preto e Amarelo
- Frontend moderno, responsivo, adaptado para mobile
- Área de login/cadastro
- Área do cliente (dashboard)
- Página de planos
- Área administrativa

> Por enquanto, o site é independente e não está conectado ao bot desktop.

## Como rodar

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Rode o projeto:
   ```bash
   npm run dev
   ```

## Estrutura Inicial
- `src/`
  - `pages/`
    - `index.tsx` (Landing Page)
    - `login.tsx` (Login/Cadastro)
    - `dashboard.tsx` (Área do Cliente)
    - `admin.tsx` (Administração)
    - `planos.tsx` (Planos)
- `public/` (assets)
- `package.json`, `tsconfig.json`, etc.

---

Este projeto será desenvolvido com Next.js (React), estilização com CSS-in-JS (styled-components) e responsividade garantida.
