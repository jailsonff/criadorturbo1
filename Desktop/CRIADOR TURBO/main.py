import sys
from PyQt5.QtWidgets import QApplication

# Importa a classe da interface gráfica do arquivo gui.py
from gui import BotInterface

if __name__ == "__main__":
    app = QApplication(sys.argv)

    # Cria uma instância da nossa interface
    janela_principal = BotInterface()
    janela_principal.show()

    # Inicia o loop de eventos da aplicação
    sys.exit(app.exec_())
# Dentro da classe Worker no arquivo c:\Users\Felix\Desktop\meu_bot_instagram\worker.py

    def run(self):
        if self._stop: self.finished.emit(f"⚠️ Processo para {self.username} interrompido antes de iniciar."); return

        QThread.msleep(500)
        self.status.emit(f"🚀 Iniciando {self.username} (E-mail: {self.email_conta})")

        parent_gui = self.get_parent_interface()
        if not parent_gui:
            self.finished.emit(f"❌ Erro crítico: Interface pai não encontrada no worker para {self.username}.")
            return

        final_message = f"⚠️ Processo para {self.username} não concluído."
        # conta_confirmada_com_sucesso = False # Removido pois já é inicializado no try

        try:
            options = Options()
            options.add_argument("--start-maximized")
            # options.add_argument("--headless")
            # options.add_argument("--disable-gpu")
            options.add_experimental_option('excludeSwitches', ['enable-logging'])
            options.add_experimental_option('useAutomationExtension', False)
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")

            try:
                self.driver = webdriver.Chrome(options=options)
                self.status.emit(f"🌐 Driver Chrome OK para {self.username}.")
                self.driver.delete_all_cookies() # Limpa cookies no início da sessão do driver
                self.status.emit(f"🍪 Cookies limpos para {self.username} no início.")
            except Exception as e:
                self.status.emit(f"❌ Erro ChromeDriver para {self.username}: {e}.")
                final_message = f"❌ Falha ao iniciar navegador para {self.username}."
                self.finished.emit(final_message)
                return
            
            # ... resto do seu método run ...

        # ... (código existente) ...
        finally:
            if self.driver:
                try:
                    self.driver.delete_all_cookies() # Limpa cookies antes de fechar
                    self.status.emit(f"🍪 Cookies limpos para {self.username} no final.")
                    self.driver.quit()
                    self.status.emit(f"🚪 Navegador fechado para {self.username} (final do processo).")
                except Exception as e:
                    self.status.emit(f"⚠️ Erro ao limpar cookies/fechar navegador no finally ({self.username}): {e}).")
            # ... (resto do finally)
