import customtkinter as ctk
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import json
import os

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("green")

class EngajamentoRealApp(ctk.CTk):
    MASC_FILE = "usuarios_masculinos.txt"
    FEM_FILE = "usuarios_femininos.txt"

    def __init__(self):
        super().__init__()
        self.title("ENGAJAMENTO REAL")
        self.geometry("1000x600")
        self.resizable(True, True)
        
        self.male_users = []
        self.female_users = []
        self.selected_male = []
        self.selected_female = []
        
        self.create_widgets()
        # Carregar listas salvas APÓS criar widgets
        self.carregar_listas_salvas()
        print("Listas carregadas ao iniciar o bot.")

    def salvar_listas(self):
        with open(self.MASC_FILE, "w", encoding="utf-8") as f:
            for item in self.male_users:
                f.write(item + "\n")
        with open(self.FEM_FILE, "w", encoding="utf-8") as f:
            for item in self.female_users:
                f.write(item + "\n")

    def carregar_listas_salvas(self):
        self.male_users.clear()
        self.female_users.clear()
        for tree in [self.male_tree, self.female_tree]:
            for item in tree.get_children():
                tree.delete(item)
        masc_count = 0
        fem_count = 0
        if os.path.exists(self.MASC_FILE):
            with open(self.MASC_FILE, "r", encoding="utf-8") as f:
                for linha in f:
                    linha = linha.strip()
                    if linha and (":" in linha):
                        usuario, _ = linha.split(":", 1)
                        # Evitar duplicatas no carregamento
                        if usuario in self.male_tree.get_children():
                            continue
                        self.male_users.append(linha)
                        self.male_tree.insert("", tk.END, iid=usuario, values=(usuario, ""))
                        self.set_status(usuario, '', 'masculino')
                        masc_count += 1
        if os.path.exists(self.FEM_FILE):
            with open(self.FEM_FILE, "r", encoding="utf-8") as f:
                for linha in f:
                    linha = linha.strip()
                    if linha and (":" in linha):
                        usuario, _ = linha.split(":", 1)
                        # Evitar duplicatas no carregamento
                        if usuario in self.female_tree.get_children():
                            continue
                        self.female_users.append(linha)
                        self.female_tree.insert("", tk.END, iid=usuario, values=(usuario, ""))
                        self.set_status(usuario, '', 'feminino')
                        fem_count += 1
        print(f"Usuários carregados: Masculinos={masc_count}, Femininos={fem_count}")
        # Atualizar contadores após carregar
        self.atualizar_contadores()

    def limpar_lista(self, genero):
        if genero == "masculino":
            self.male_users.clear()
            self.male_tree.delete(*self.male_tree.get_children())
            open(self.MASC_FILE, "w").close()
        else:
            self.female_users.clear()
            self.female_tree.delete(*self.female_tree.get_children())
            open(self.FEM_FILE, "w").close()
        self.salvar_listas()

    def atualizar_lista(self, genero):
        self.carregar_listas_salvas()

    def set_status(self, usuario, status, genero):
        tree = self.male_tree if genero == 'masculino' else self.female_tree
        if usuario in tree.get_children():
            tree.set(usuario, 'status', status)
            if status == '✔':
                tree.item(usuario, tags=('ok',))
            elif status == '✖':
                tree.item(usuario, tags=('erro',))

    def on_tree_select(self, genero):
        pass  # Placeholder para seleção futura

    def create_widgets(self):
        # Tabs
        tabview = ctk.CTkTabview(self)
        tabview.pack(fill="both", expand=True, padx=20, pady=20)
        tabview.configure(width=1, height=1)
        tab_principal = tabview.add("PRINCIPAL")
        tab_automacao = tabview.add("AUTOMAÇÃO")

        # ---- ABA PRINCIPAL ----
        # Frame principal
        frame = ctk.CTkFrame(tab_principal)
        frame.pack(fill="both", expand=True)

        # Título
        title = ctk.CTkLabel(frame, text="ENGAJAMENTO REAL", font=("Arial", 28, "bold"), text_color="#00FF00")
        title.pack(pady=10)

        # Cadastro
        cadastro_frame = ctk.CTkFrame(frame)
        cadastro_frame.pack(pady=10)
        self.user_entry = ctk.CTkEntry(cadastro_frame, placeholder_text="Usuário")
        self.user_entry.grid(row=0, column=0, padx=5)
        self.pass_entry = ctk.CTkEntry(cadastro_frame, placeholder_text="Senha", show="*")
        self.pass_entry.grid(row=0, column=1, padx=5)
        self.gender_var = tk.StringVar(value="masculino")
        ctk.CTkRadioButton(cadastro_frame, text="Masculino", variable=self.gender_var, value="masculino").grid(row=0, column=2, padx=5)
        ctk.CTkRadioButton(cadastro_frame, text="Feminino", variable=self.gender_var, value="feminino").grid(row=0, column=3, padx=5)
        ctk.CTkButton(cadastro_frame, text="Cadastrar", command=self.cadastrar_usuario).grid(row=0, column=4, padx=5)

        # Listas de usuários
        listas_frame = ctk.CTkFrame(frame)
        listas_frame.pack(fill="both", expand=True, pady=10)
        
        # Masculino
        male_frame = ctk.CTkFrame(listas_frame)
        male_frame.pack(side="left", fill="both", expand=True, padx=10)
        
        # Título e contador para masculinos
        male_header = ctk.CTkFrame(male_frame)
        male_header.pack(fill="x", pady=5)
        ctk.CTkLabel(male_header, text="Usuários Masculinos", font=("Arial", 16)).pack(side="left", padx=5)
        self.male_count_label = ctk.CTkLabel(male_header, text="(0)", font=("Arial", 16))
        self.male_count_label.pack(side="right", padx=5)
        self.male_tree = ttk.Treeview(male_frame, columns=("usuario", "status"), show="headings", height=12)
        self.male_tree.heading("usuario", text="Usuário")
        self.male_tree.heading("status", text="Status")
        self.male_tree.column("usuario", width=140, anchor="w")
        self.male_tree.column("status", width=60, anchor="center")
        self.male_tree.pack(fill="both", expand=True, padx=5, pady=5)
        self.male_tree.tag_configure('ok', background='#d4ffd4', foreground='#228B22')  # verde claro/fonte verde
        self.male_tree.tag_configure('erro', background='#ffd4d4', foreground='#B22222')  # vermelho claro/fonte vermelha
        self.male_tree.bind('<ButtonRelease-1>', lambda e: self.on_tree_select('masculino'))
        ctk.CTkButton(male_frame, text="Importar TXT", command=lambda: self.importar_usuarios('masculino')).pack(pady=2)
        ctk.CTkButton(male_frame, text="Limpar Lista", command=lambda: self.limpar_lista('masculino')).pack(pady=2)
        ctk.CTkButton(male_frame, text="Atualizar Lista", command=lambda: self.atualizar_lista('masculino')).pack(pady=2)

        # Feminino
        female_frame = ctk.CTkFrame(listas_frame)
        female_frame.pack(side="right", fill="both", expand=True, padx=10)
        
        # Título e contador para femininos
        female_header = ctk.CTkFrame(female_frame)
        female_header.pack(fill="x", pady=5)
        ctk.CTkLabel(female_header, text="Usuários Femininos", font=("Arial", 16)).pack(side="left", padx=5)
        self.female_count_label = ctk.CTkLabel(female_header, text="(0)", font=("Arial", 16))
        self.female_count_label.pack(side="right", padx=5)
        self.female_tree = ttk.Treeview(female_frame, columns=("usuario", "status"), show="headings", height=12)
        self.female_tree.heading("usuario", text="Usuário")
        self.female_tree.heading("status", text="Status")
        self.female_tree.column("usuario", width=140, anchor="w")
        self.female_tree.column("status", width=60, anchor="center")
        self.female_tree.pack(fill="both", expand=True, padx=5, pady=5)
        self.female_tree.tag_configure('ok', background='#d4ffd4', foreground='#228B22')  # verde claro/fonte verde
        self.female_tree.tag_configure('erro', background='#ffd4d4', foreground='#B22222')  # vermelho claro/fonte vermelha
        self.female_tree.bind('<ButtonRelease-1>', lambda e: self.on_tree_select('feminino'))
        ctk.CTkButton(female_frame, text="Importar TXT", command=lambda: self.importar_usuarios('feminino')).pack(pady=2)
        ctk.CTkButton(female_frame, text="Limpar Lista", command=lambda: self.limpar_lista('feminino')).pack(pady=2)
        ctk.CTkButton(female_frame, text="Atualizar Lista", command=lambda: self.atualizar_lista('feminino')).pack(pady=2)

        # Botão iniciar automação (apenas login)
        self.automacao_btn = ctk.CTkButton(frame, text="Iniciar Automação (Apenas Login)", command=self.iniciar_automacao, fg_color="#00FF00", text_color="#000")
        self.automacao_btn.pack(pady=15)

        # ---- ABA AUTOMAÇÃO ----
        automacao_frame = ctk.CTkFrame(tab_automacao)
        automacao_frame.pack(fill="both", expand=True)

        ctk.CTkLabel(automacao_frame, text="Automação de Comentários", font=("Arial", 24, "bold"), text_color="#00FF00").pack(pady=10)

        # Link do post
        ctk.CTkLabel(automacao_frame, text="Link do post do Instagram:", font=("Arial", 14)).pack(anchor="w")
        self.link_entry = ctk.CTkEntry(automacao_frame, width=400)
        self.link_entry.pack(anchor="w", pady=(0, 10))

        # Comentários
        ctk.CTkLabel(automacao_frame, text="Comentários (um por linha):", font=("Arial", 14)).pack(anchor="w")
        comentarios_row = ctk.CTkFrame(automacao_frame)
        comentarios_row.pack(fill="x", pady=(0, 10))
        self.comentarios_text = ctk.CTkTextbox(comentarios_row, width=400, height=100)
        self.comentarios_text.pack(side="left", fill="both", expand=True)
        self.automacao_coment_btn = ctk.CTkButton(comentarios_row, text="Iniciar Automação de Comentários", fg_color="#00FF00", text_color="#000", command=self.iniciar_automacao_post)
        self.automacao_coment_btn.pack(side="left", padx=15, pady=10)

        # Seletor de ação
        seletores_frame = ctk.CTkFrame(automacao_frame)
        seletores_frame.pack(fill="x", pady=(10, 2))
        self.acao_var = tk.StringVar(value="comentario")
        self.rb_comentario = ctk.CTkRadioButton(seletores_frame, text="Comentário", variable=self.acao_var, value="comentario", command=self.atualiza_campo_comentario)
        self.rb_comentario.grid(row=0, column=0, padx=10)
        self.rb_curtir = ctk.CTkRadioButton(seletores_frame, text="Curtir", variable=self.acao_var, value="curtir", command=self.atualiza_campo_comentario)
        self.rb_curtir.grid(row=0, column=1, padx=10)

        acoes_frame = ctk.CTkFrame(automacao_frame)
        acoes_frame.pack(fill="x", pady=(20, 2))
        ctk.CTkLabel(acoes_frame, text="Quantidade de ações:", font=("Arial", 14)).grid(row=0, column=0, padx=5)
        self.qtd_acoes_entry = ctk.CTkEntry(acoes_frame, width=80)
        self.qtd_acoes_entry.grid(row=0, column=1, padx=5)
        ctk.CTkLabel(acoes_frame, text="Simultâneos:", font=("Arial", 14)).grid(row=0, column=2, padx=5)
        self.qtd_simultaneos_entry = ctk.CTkEntry(acoes_frame, width=80)
        self.qtd_simultaneos_entry.grid(row=0, column=3, padx=5)

        # Campo de log
        ctk.CTkLabel(automacao_frame, text="Log da Automação:", font=("Arial", 14)).pack(anchor="w", pady=(10,0))
        self.log_text = ctk.CTkTextbox(automacao_frame, width=800, height=120, state="normal")
        self.log_text.pack(fill="both", expand=True, pady=(0, 10))
        self.log_text.insert("end", "Log iniciado...\n")
        self.log_text.configure(state="disabled")


    def atualiza_campo_comentario(self):
        if self.acao_var.get() == "comentario":
            self.comentarios_text.configure(state="normal")
        else:
            self.comentarios_text.delete("1.0", tk.END)
            self.comentarios_text.configure(state="disabled")

    def cadastrar_usuario(self):
        usuario = self.user_entry.get().strip()
        senha = self.pass_entry.get().strip()
        genero = self.gender_var.get()
        if not usuario or not senha:
            messagebox.showerror("Erro", "Preencha usuário e senha!")
            return
        
        # Verificar se o usuário já existe na árvore correspondente
        tree = self.male_tree if genero == "masculino" else self.female_tree
        if usuario in tree.get_children():
            messagebox.showerror("Erro", f"O usuário {usuario} já existe na lista de {genero}s!")
            return
            
        item = f"{usuario}:{senha}"
        if genero == "masculino":
            self.male_users.append(item)
            self.male_tree.insert("", tk.END, iid=usuario, values=(usuario, ""))
        else:
            self.female_users.append(item)
            self.female_tree.insert("", tk.END, iid=usuario, values=(usuario, ""))
        self.user_entry.delete(0, tk.END)
        self.pass_entry.delete(0, tk.END)
        self.salvar_listas()
        
        # Atualizar contadores
        self.atualizar_contadores()

    def atualizar_contadores(self):
        # Atualizar contadores de usuários
        male_count = len(self.male_tree.get_children())
        female_count = len(self.female_tree.get_children())
        self.male_count_label.configure(text=f"({male_count})")
        self.female_count_label.configure(text=f"({female_count})")
    
    def importar_usuarios(self, genero):
        filename = filedialog.askopenfilename(title="Importar TXT", filetypes=[("TXT Files", "*.txt")])
        if filename:
            with open(filename, "r", encoding="utf-8") as f:
                linhas = f.readlines()
            for linha in linhas:
                linha = linha.strip()
                if not linha or (":" not in linha and "," not in linha):
                    continue
                if ":" in linha:
                    usuario, senha = linha.split(":", 1)
                else:
                    usuario, senha = linha.split(",", 1)
                item = f"{usuario}:{senha}"
                # Verificar se o usuário já existe antes de adicioná-lo
                tree = self.male_tree if genero == "masculino" else self.female_tree
                if usuario in tree.get_children():
                    continue  # Pular usuários duplicados
                
                if genero == "masculino":
                    self.male_users.append(item)
                    self.male_tree.insert("", tk.END, iid=usuario, values=(usuario, ""))
                else:
                    self.female_users.append(item)
                    self.female_tree.insert("", tk.END, iid=usuario, values=(usuario, ""))
            self.salvar_listas()
            self.atualizar_contadores()

    def iniciar_automacao(self):
        import threading
        from utils import login_instagram, checar_chromedriver
        def run_automation():
            self.automacao_btn.configure(state='disabled', text='Automatizando...')
            selected_male_ids = self.male_tree.selection()
            selected_male = [self.male_tree.item(i, 'values')[0] for i in selected_male_ids]
            selected_female_ids = self.female_tree.selection()
            selected_female = [self.female_tree.item(i, 'values')[0] for i in selected_female_ids]
            selecionados = selected_male + selected_female
            if not selecionados:
                messagebox.showwarning("Atenção", "Selecione pelo menos um usuário!")
                self.automacao_btn.configure(state='normal', text='Iniciar Automação (Apenas Login)')
                return
            if not checar_chromedriver():
                messagebox.showerror("Erro", "chromedriver.exe não encontrado. Baixe em: https://chromedriver.chromium.org/downloads e coloque na mesma pasta do bot.")
                self.automacao_btn.configure(state='normal', text='Iniciar Automação (Apenas Login)')
                return
            status_msgs = []
            for nome_usuario in selecionados:
                user_full = next((u for u in self.male_users + self.female_users if u.startswith(nome_usuario + ":")), None)
                if not user_full:
                    status_msgs.append(f"{nome_usuario}: Usuário não encontrado na lista completa!")
                    self.set_status(nome_usuario, '✖', 'masculino' if nome_usuario in [u.split(':')[0] for u in self.male_users] else 'feminino')
                    continue
                usuario, senha = user_full.split(":", 1)
                ok, msg = login_instagram(usuario, senha, headless=True)
                status_icon = '✔' if ok else '✖'
                genero = 'masculino' if usuario in [u.split(':')[0] for u in self.male_users] else 'feminino'
                self.set_status(usuario, status_icon, genero)
                status_msgs.append(f"{usuario}: {msg}")
            messagebox.showinfo("Automação Finalizada", "\n".join(status_msgs))
            self.automacao_btn.configure(state='normal', text='Iniciar Automação (Apenas Login)')
        threading.Thread(target=run_automation).start()

    def log(self, msg):
        self.log_text.configure(state="normal")
        self.log_text.insert("end", msg + "\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def iniciar_automacao_post(self):
        import threading
        from utils import login_instagram, checar_chromedriver, comentar_post, curtir_post
        def run_post_automation():
            self.automacao_coment_btn.configure(state='disabled', text='Automatizando...')
            self.log("Iniciando automação...")
            # Seleciona usuários marcados na aba principal (Treeview)
            selected_male_ids = self.male_tree.selection()
            selected_male = [self.male_tree.item(i, 'values')[0] for i in selected_male_ids]
            selected_female_ids = self.female_tree.selection()
            selected_female = [self.female_tree.item(i, 'values')[0] for i in selected_female_ids]
            selecionados = selected_male + selected_female
            if not selecionados:
                self.log("Nenhum usuário selecionado!")
                messagebox.showwarning("Atenção", "Selecione pelo menos um usuário na aba PRINCIPAL!")
                self.automacao_coment_btn.configure(state='normal', text='Iniciar Automação de Comentários')
                return
            if not checar_chromedriver():
                self.log("chromedriver.exe não encontrado!")
                messagebox.showerror("Erro", "chromedriver.exe não encontrado. Baixe em: https://chromedriver.chromium.org/downloads e coloque na mesma pasta do bot.")
                self.automacao_coment_btn.configure(state='normal', text='Iniciar Automação de Comentários')
                return
            link = self.link_entry.get().strip()
            if not link:
                self.log("Link do post não informado!")
                messagebox.showwarning("Atenção", "Informe o link do post!")
                self.automacao_coment_btn.configure(state='normal', text='Iniciar Automação de Comentários')
                return
            acao = self.acao_var.get()
            comentarios = self.comentarios_text.get("1.0", "end").strip().split("\n") if acao == "comentario" else []
            qtd_acoes = self.qtd_acoes_entry.get().strip()
            qtd_simultaneos = self.qtd_simultaneos_entry.get().strip()
            try:
                qtd_acoes = int(qtd_acoes) if qtd_acoes else 1
                qtd_simultaneos = int(qtd_simultaneos) if qtd_simultaneos else 1
            except:
                self.log("Quantidade de ações/simultâneos inválida!")
                messagebox.showwarning("Atenção", "Quantidade de ações e simultâneos devem ser números!")
                self.automacao_coment_btn.configure(state='normal', text='Iniciar Automação de Comentários')
                return
            status_msgs = []
            for idx, nome_usuario in enumerate(selecionados[:qtd_acoes]):
                # Busca usuario:senha na lista completa
                user_full = next((u for u in self.male_users + self.female_users if u.startswith(nome_usuario + ":")), None)
                if not user_full:
                    self.log(f"[{nome_usuario}] Usuário não encontrado na lista completa!")
                    status_msgs.append(f"{nome_usuario}: Usuário não encontrado na lista completa!")
                    continue
                usuario, senha = user_full.split(":", 1)
                if acao == "comentario":
                    comentario = comentarios[idx % len(comentarios)] if comentarios else ""
                    self.log(f"[{usuario}] Comentando: {comentario}")
                    ok2, msg2 = comentar_post(usuario, senha, link, comentario)
                    self.log(f"[{usuario}] Resultado: {msg2}")
                    status_msgs.append(f"{usuario}: {msg2}")
                else:
                    self.log(f"[{usuario}] Curtindo post...")
                    ok2, msg2 = curtir_post(usuario, senha, link)
                    self.log(f"[{usuario}] Resultado: {msg2}")
                    status_msgs.append(f"{usuario}: {msg2}")
            self.log("Automação finalizada!")
            messagebox.showinfo("Automação Finalizada", "\n".join(status_msgs))
            self.automacao_coment_btn.configure(state='normal', text='Iniciar Automação de Comentários')
        threading.Thread(target=run_post_automation).start()

if __name__ == "__main__":
    app = EngajamentoRealApp()
    app.mainloop()
