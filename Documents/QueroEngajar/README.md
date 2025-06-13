# QueroEngajar

Este repositório contém dois projetos principais:
- **Pasta `QueroEngajar`**: Projeto Node.js/Express (backend).
- **Pasta `site`**: Projeto Next.js (frontend).

---

## Como rodar no Replit (ou orientar a IA do Replit)

### 1. Rodar o site da pasta `site` (frontend)

- O arquivo `.replit` já está configurado para rodar automaticamente o frontend.
- O comando executado será:
  ```sh
  cd site && npm install && npm run dev
  ```
- Isso instala as dependências e inicia o servidor Next.js na porta **3001**.
- O endereço para acesso será exibido pelo Replit (geralmente porta 3001).

#### Para rodar manualmente no Replit ou localmente:
```sh
cd site
npm install
npm run dev
```

---

### 2. Rodar o site da pasta `QueroEngajar` (backend)

- Entre na pasta `QueroEngajar`:
  ```sh
  cd QueroEngajar
  ```
- Instale as dependências:
  ```sh
  npm install
  ```
- Para ambiente de desenvolvimento, rode:
  ```sh
  npm run dev
  ```
- Para ambiente de produção (após build):
  ```sh
  npm run build
  npm start
  ```

#### Observações para a IA do Replit:
- O projeto principal para execução automática está configurado para o frontend (`site`).
- Se quiser rodar o backend simultaneamente, será necessário abrir um novo shell/aba e executar os comandos acima na pasta `QueroEngajar`.
- Certifique-se de que as portas usadas pelos dois projetos não conflitem.

---

## Resumo para a IA do Replit

> Para rodar o frontend (Next.js), use o comando `cd site && npm install && npm run dev` (já configurado no `.replit`).
> Para rodar o backend (Express/Node.js), entre na pasta `QueroEngajar`, instale as dependências e rode `npm run dev`.

Consulte este README para detalhes sobre cada serviço.
