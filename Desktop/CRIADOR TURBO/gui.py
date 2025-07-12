import sys
import random
import time
import imaplib
import email
# import threading # Aparentemente não usado pela BotInterface ou Worker no original
from datetime import datetime, timedelta
from pytz import timezone, utc
import re
import os
import string
import calendar

# Tentar importar Faker, necessário para nomes aleatórios
try:
    from faker import Faker
except ImportError:
    print("Biblioteca Faker não encontrada. Por favor, instale com: pip install Faker")
    Faker = None
    # sys.exit("Faker não instalado. Encerrando.")

from PyQt5.QtCore import Qt, QObject, QThread, pyqtSignal, QTimer
from selenium.webdriver.common.by import By  # Adicionado para fazer referência aos elementos
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
    QLabel, QPushButton, QListWidget, QListWidgetItem, QTabWidget, 
    QGroupBox, QTextEdit, QScrollArea, QMessageBox, QComboBox,
    QFileDialog, QProgressBar, QLineEdit, QCheckBox, QTableWidget,
    QTableWidgetItem, QHeaderView, QAbstractItemView, QSpinBox
)
import json
from PyQt5.QtGui import QIcon, QRegularExpressionValidator, QPixmap, QColor
from PyQt5.QtWidgets import QSpacerItem, QSizePolicy, QMessageBox 
from PyQt5.QtCore import (QRegularExpression, QThread, pyqtSignal, QSettings,
                          QTimer, Qt, QMutex, QWaitCondition, pyqtSlot)

# Importa a classe Worker do arquivo worker.py
from worker import Worker
# Usar a versão otimizada do DolphinAntyManager para economia de espaço
from dolphin_anty_optimized import DolphinAntyOptimizedManager as DolphinAntyManager
from automacao_worker_final import AutomacaoAcoesWorker # Import para automação de ações

# --- INÍCIO DA NOVA CLASSE DOLPHINACTIONWORKER ---
class DolphinActionWorker(QThread):
    """
    Worker para executar ações do Dolphin Anty em segundo plano.
    """
    # Sinais: username, success, new_status_for_profile, message_from_action, original_action
    action_completed = pyqtSignal(str, bool, str, str, str)
    status_update = pyqtSignal(str)

    def __init__(self, dolphin_manager, username, action, password=None, email_or_user=None, parent=None, keep_open_on_error=False):
        super().__init__(parent)
        self.dolphin_manager = dolphin_manager
        self.username = username
        self.action = action  # "launch_and_login", "launch_only", "close"
        self.password = password
        self.email_or_user = email_or_user
        self._stop_flag = False
        self.keep_open_on_error = keep_open_on_error  # Nova flag para manter o navegador aberto em caso de erro

    def stop(self):
        self._stop_flag = True

    def run(self):
        if self._stop_flag:
            self.action_completed.emit(self.username, False, "desconectado", "Ação interrompida antes de iniciar.", self.action)
            return

        if self.action == "launch_and_login":
            # O worker agora define o status para "logando" nos metadados
            self.dolphin_manager.update_profile_bot_login_status(self.username, "logando", "Worker iniciando processo de login...")
            # A GUI já deve ter atualizado o botão visualmente.
            self.status_update.emit(f"🐬 Worker: Abrindo navegador para '{self.username}'...")
            success, launch_message = self.dolphin_manager.launch_profile_instagram(self.username, go_to_instagram_home=False)
            # Obter o driver após o lançamento
            driver = self.dolphin_manager.get_profile_driver(self.username) if success else None

            if self._stop_flag:
                # Se parou, o driver pode ou não ter sido aberto.
                # O status do perfil no manager já foi definido por launch_profile_instagram
                current_meta_status = self.dolphin_manager.get_profile_metadata(self.username).get('bot_login_status', 'desconectado')
                self.action_completed.emit(self.username, False, current_meta_status, "Login interrompido.", self.action)
                return

            if driver:
                self.status_update.emit(f"🐬 Worker: Tentando login em '{self.username}'...")
                # Obter resultado do attempt_login_instagram que retorna (success, message)
                result = self.dolphin_manager.attempt_login_instagram(driver, self.username, self.password)
                if result is None:
                    login_success = False
                    login_status = "erro_login"
                    login_message = "Erro no processo de login - retorno inesperado"
                else:
                    login_success, login_message = result
                    login_status = "success" if login_success else "erro_login"
                
                if login_success:
                    print(f"[DEBUG] Login bem-sucedido para {self.username}. Status: {login_status}")
                    # Não precisamos atualizar o status novamente, pois attempt_login_instagram já o fez
                    meta = self.dolphin_manager.get_profile_metadata(self.username)
                    print(f"[DEBUG] Status salvo nos metadados após login: {meta.get('bot_login_status') if meta else 'N/A'}")
                    
                    # Adicionar uma pausa de 10 segundos após o login bem-sucedido
                    self.status_update.emit(f"🐬 Aguardando 10 segundos antes de concluir...")
                    time.sleep(10)
                    
                    self.action_completed.emit(self.username, True, login_status, login_message, self.action)
                else:
                    # Verifica se deve manter o navegador aberto para intervenção manual
                    if self.keep_open_on_error:
                        erro_especifico = "erro desconhecido"
                        if "verificacao" in login_status.lower():
                            erro_especifico = "verificação necessária"
                        elif "falha" in login_status.lower():
                            erro_especifico = "falha no login"
                        elif "susp" in login_message.lower():
                            erro_especifico = "conta possivelmente suspensa"
                        
                        # Atualiza metadados para indicar que está aguardando intervenção
                        self.dolphin_manager.update_profile_bot_login_status(
                            self.username, 
                            "aguardando_intervencao", 
                            f"Aguardando intervenção manual: {erro_especifico}"
                        )
                        
                        # Emitir sinal indicando que o navegador está aguardando intervenção
                        self.status_update.emit(
                            f"⚠️ NAVEGADOR MANTIDO ABERTO para '{self.username}': {erro_especifico}. " + 
                            f"Resolva o problema e feche manualmente quando terminar."
                        )
                        
                        # Ainda emitimos o sinal de conclusão, mas com status especial
                        self.action_completed.emit(self.username, False, "aguardando_intervencao", 
                                                   f"Aguardando intervenção manual: {login_message}", self.action)
                    else:
                        # Comportamento normal: não mantém o navegador aberto
                        # Não precisamos atualizar o status novamente, pois attempt_login_instagram já o fez
                        self.action_completed.emit(self.username, False, login_status, login_message, self.action)
            else:
                # launch_profile_instagram já atualizou o status para erro_ao_abrir
                current_meta_status = self.dolphin_manager.get_profile_metadata(self.username).get('bot_login_status', 'erro_ao_abrir')
                self.action_completed.emit(self.username, False, current_meta_status, launch_message, self.action)

        elif self.action == "login_full": # Novo modo que abre o navegador e faz login automaticamente
            self.status_update.emit(f"🐯 Iniciando navegador para perfil '{self.username}' com login automático...")
            
            try:
                # Primeiro lança o navegador com o perfil
                success, message = self.dolphin_manager.launch_profile_instagram(self.username, go_to_instagram_home=True)
                
                if not success:
                    self.status_update.emit(f"❌ Erro ao abrir navegador: {message}")
                    metadata = self.dolphin_manager.get_profile_metadata(self.username)
                    if metadata:
                        metadata["bot_login_status"] = "erro_ao_abrir"
                        metadata["last_error"] = message
                        self.dolphin_manager.save_profile_metadata(self.username, metadata)
                    self.action_completed.emit(self.username, False, "erro_ao_abrir", message, self.action)
                    return
                
                # Verificar se o driver foi realmente criado
                driver = self.dolphin_manager.get_profile_driver(self.username)
                if not driver:
                    error_msg = "Driver não foi criado corretamente"
                    self.status_update.emit(f"❌ {error_msg}")
                    self.action_completed.emit(self.username, False, "erro_ao_abrir", error_msg, self.action)
                    return
                
                # Obter os metadados para as credenciais
                meta = self.dolphin_manager.get_profile_metadata(self.username)
                if not meta:
                    self.status_update.emit(f"❌ Metadados do perfil não encontrados para '{self.username}'")
                    self.action_completed.emit(self.username, False, "erro_login", "Metadados não encontrados", self.action)
                    return
                
                # Obter credenciais do perfil
                email_or_user = meta.get('email', self.username)
                password = meta.get('password')
                
                if not password:
                    self.status_update.emit(f"❌ Senha não definida para '{self.username}'")
                    self.action_completed.emit(self.username, False, "erro_login", "Senha não definida", self.action)
                    return
                
                # Usar o método attempt_login_instagram que está funcionando bem em outras partes
                self.status_update.emit(f"🔐 Tentando fazer login para '{self.username}'...")
                # Este método retorna (success, status, message)
                result = self.dolphin_manager.attempt_login_instagram(self.username, password, email_or_user)
                
                if result is None:
                    login_success, login_status, login_message = False, "erro_login", "Erro no processo de login - retorno inesperado"
                else:
                    login_success, login_status, login_message = result
                
                if login_success:
                    self.status_update.emit(f"✅ Login realizado com sucesso para '{self.username}'! Status: {login_status}")
                    # Não precisamos atualizar o status novamente, pois attempt_login_instagram já o fez
                    self.action_completed.emit(self.username, True, login_status, login_message, self.action)
                else:
                    self.status_update.emit(f"⚠️ Erro no login para '{self.username}': {login_message}")
                    self.action_completed.emit(self.username, False, login_status, login_message, self.action)
                
            except Exception as e:
                self.status_update.emit(f"❌ Erro geral no processo de login: {str(e)}")
                self.action_completed.emit(self.username, False, "erro_login", str(e), self.action)
                
        elif self.action == "launch_only": # Usado pelo clique duplo e pelo botão de login
            self.status_update.emit(f"🐯 Iniciando navegador para perfil '{self.username}'...")
            
            try:
                # Usar True para garantir que vá para o Instagram
                success, message = self.dolphin_manager.launch_profile_instagram(self.username, go_to_instagram_home=True)
                
                if not success:
                    self.status_update.emit(f"❌ Erro ao abrir navegador: {message}")
                    metadata = self.dolphin_manager.get_profile_metadata(self.username)
                    if metadata:
                        metadata["bot_login_status"] = "erro_ao_abrir"
                        metadata["last_error"] = message
                        self.dolphin_manager.save_profile_metadata(self.username, metadata)
                    self.action_completed.emit(self.username, False, "erro_ao_abrir", message, self.action)
                    return
                
                # Verificar se o driver foi realmente criado
                driver = self.dolphin_manager.get_profile_driver(self.username)
                if not driver:
                    error_msg = "Driver não foi criado corretamente"
                    self.status_update.emit(f"❌ {error_msg}")
                    self.action_completed.emit(self.username, False, "erro_ao_abrir", error_msg, self.action)
                    return
                
                # Esperar para verificar se a página carregou corretamente
                try:
                    self.status_update.emit(f"⏳ Aguardando carregamento da página para '{self.username}'...")
                    WebDriverWait(driver, 15).until(
                        lambda d: d.execute_script('return document.readyState') == 'complete'
                    )
                    # Se chegou até aqui, o navegador foi aberto com sucesso
                    self.status_update.emit(f"✅ Navegador aberto com sucesso para '{self.username}'")
                except Exception as wait_error:
                    self.status_update.emit(f"⚠️ Alerta: Página pode não ter carregado completamente: {str(wait_error)}")
                
                # Atualizar metadados do perfil
                metadata = self.dolphin_manager.get_profile_metadata(self.username)
                if metadata:
                    metadata["bot_login_status"] = "navegador_aberto"
                    metadata["last_access"] = time.strftime("%Y-%m-%d %H:%M:%S")
                    self.dolphin_manager.save_profile_metadata(self.username, metadata)
                
                # Informar que o processo foi concluído com sucesso
                self.action_completed.emit(self.username, True, "navegador_aberto", "Navegador aberto com sucesso", self.action)
                    
                # Se chegou até aqui, temos um driver válido
            except Exception as e:
                self.status_update.emit(f"❌ Erro ao abrir navegador: {str(e)}")
                self.action_completed.emit(self.username, False, "erro_ao_abrir", str(e), self.action)
                return
                
            # Se chegou até aqui, temos um driver válido
            if driver:
                self.status_update.emit(f"✅ Navegador aberto com sucesso para '{self.username}'")
                
                # Verifica se o perfil está logado
                self.status_update.emit(f"🔐 Verificando status de login para '{self.username}'...")
                
                meta = self.dolphin_manager.get_profile_metadata(self.username)
                current_bot_status = meta.get('bot_login_status', 'desconectado') if meta else 'desconectado'
                
                # Verifica se é um perfil que nunca fez login antes
                is_new_profile = current_bot_status not in ["conectado", "login_realizado"]
                
                # Para perfis novos, força o login independentemente da detecção
                if is_new_profile:
                    self.status_update.emit(f"🔔 Perfil '{self.username}' parece ser novo. Ignorando detecção de login e forçando login...")
                    is_logged_in = False
                else:
                    # Apenas verifica o login para perfis que já foram usados antes
                    is_logged_in = self.dolphin_manager.is_logged_in(driver)
                
                # Se não estiver logado, tenta fazer login automaticamente
                if not is_logged_in:
                    self.status_update.emit(f"🔄 Perfil '{self.username}' não está logado. Iniciando login automático...")
                    
                    # Verifica se temos as credenciais necessárias
                    email_or_user = meta.get('email')
                    password = meta.get('password')
                    
                    # Exibe informações sobre as credenciais que serão usadas
                    self.status_update.emit(f"🔍 Credenciais encontradas - Email/Usuário: {email_or_user or 'Não definido'}, Senha: {'Definida' if password else 'Não definida'}")
                    
                    if email_or_user and password:
                        # Tenta fazer login
                        self.status_update.emit(f"🔄 Tentando login automático para '{self.username}' com {email_or_user}...")
                        # Corrigido: chamando o método com os argumentos corretos
                        result = self.dolphin_manager.attempt_login_instagram(self.username, password, email_or_user)
                        
                        if result is None:
                            login_success, login_status, login_message = False, "erro_login", "Erro no processo de login"
                        else:
                            login_success, login_status, login_message = result
                        
                        if login_success:
                            self.status_update.emit(f"✅ Login automático realizado com sucesso para '{self.username}'!")
                            self.dolphin_manager.update_profile_bot_login_status(self.username, "conectado")
                            final_status_to_emit = "conectado"
                            self.action_completed.emit(self.username, True, final_status_to_emit, "Login automático realizado com sucesso!", self.action)
                        else:
                            self.status_update.emit(f"⚠️ Falha no login automático para '{self.username}': {login_message}")
                            
                            # Verifica se deve manter o navegador aberto para intervenção manual
                            if self.keep_open_on_error:
                                erro_especifico = "erro desconhecido"
                                if "verificacao" in login_status.lower():
                                    erro_especifico = "verificação necessária"
                                elif "falha" in login_status.lower():
                                    erro_especifico = "falha no login"
                                elif "susp" in login_message.lower():
                                    erro_especifico = "conta possivelmente suspensa"
                                
                                # Atualiza metadados para indicar que está aguardando intervenção
                                self.dolphin_manager.update_profile_bot_login_status(
                                    self.username, 
                                    "aguardando_intervencao", 
                                    f"Aguardando intervenção manual: {erro_especifico}"
                                )
                                
                                self.status_update.emit(
                                    f"⚠️ NAVEGADOR MANTIDO ABERTO para '{self.username}': {erro_especifico}. " + 
                                    f"Resolva o problema e feche manualmente quando terminar."
                                )
                                
                                final_status_to_emit = "aguardando_intervencao"
                                self.action_completed.emit(self.username, False, final_status_to_emit, 
                                                        f"Aguardando intervenção manual: {login_message}", self.action)
                            else:
                                # Comportamento normal: não mantém o navegador aberto
                                self.dolphin_manager.update_profile_bot_login_status(self.username, "aberto_sem_login")
                                final_status_to_emit = "aberto_sem_login"
                                self.action_completed.emit(self.username, True, final_status_to_emit, f"Aberto sem login: {login_message}", self.action)
                    else:
                        self.status_update.emit(f"⚠️ Credenciais incompletas para login automático de '{self.username}'")
                        self.dolphin_manager.update_profile_bot_login_status(self.username, "aberto_sem_login")
                        final_status_to_emit = "aberto_sem_login"
                        self.action_completed.emit(self.username, True, final_status_to_emit, "Aberto sem login (credenciais incompletas)", self.action)
                else:
                    # Já está logado
                    self.status_update.emit(f"✅ Perfil '{self.username}' já está logado!")
                    self.dolphin_manager.update_profile_bot_login_status(self.username, "conectado")
                    final_status_to_emit = "conectado"
                    self.action_completed.emit(self.username, True, final_status_to_emit, "Perfil aberto e já está logado", self.action)
            else:
                # launch_profile_instagram já atualizou o status para erro_ao_abrir
                current_meta_status = self.dolphin_manager.get_profile_metadata(self.username).get('bot_login_status', 'erro_ao_abrir')
                self.action_completed.emit(self.username, False, current_meta_status, message, self.action)

        elif self.action == "close":
            self.status_update.emit(f"🐬 Worker: Fechando perfil '{self.username}'...")
            # Obtém o status ANTES de fechar, para saber se deve manter "conectado"
            meta_before_close = self.dolphin_manager.get_profile_metadata(self.username)
            status_before_close = meta_before_close.get('bot_login_status', 'desconectado') if meta_before_close else 'desconectado'
            
            closed, message = self.dolphin_manager.close_profile_driver(self.username)
            if closed and status_before_close == "conectado":
                self.action_completed.emit(self.username, True, "conectado", message, self.action)
            else: # Se não estava conectado antes, ou se falhou ao fechar, vai para desconectado
                self.action_completed.emit(self.username, closed, "desconectado", message, self.action)
        else:
            self.action_completed.emit(self.username, False, "desconhecido", f"Ação desconhecida: {self.action}", self.action)
# --- FIM DA NOVA CLASSE DOLPHINACTIONWORKER ---

class BotInterface(QWidget):
    enviar_codigo_manual_para_worker = pyqtSignal(str)
    perfil_selecionado_signal = pyqtSignal(str) # Novo sinal para quando um perfil é selecionado

    def __init__(self):
        super().__init__()
        
        self.nome_atual_para_worker = "Usuario Teste"
        self.automacao_worker = None  # Worker para automação de ações
        self.workers_list = []
        self.profile_buttons = {} # {username: QPushButton_instance}
        self.dolphin_action_workers = {} # {username: DolphinActionWorker_instance}

        # Determinar o base_bot_path para o DolphinAntyManager
        if hasattr(sys, '_MEIPASS'):
            # Se estiver rodando como executável PyInstaller
            self.base_bot_path = sys._MEIPASS
        else:
            # Se estiver rodando como script .py
            self.base_bot_path = os.path.dirname(os.path.abspath(__file__))

        # --- TIMER PARA MONITORAR STATUS DOS DRIVERS ---
        self.driver_monitor_timer = QTimer(self)
        self.driver_monitor_timer.setInterval(2500)  # 2.5 segundos
        self.driver_monitor_timer.timeout.connect(self._monitorar_drivers_conectados)
        self.driver_monitor_timer.start()
        # --- FIM TIMER ---

        self.dolphin_manager = DolphinAntyManager(base_bot_path=self.base_bot_path)
        self.settings = QSettings("instagram_bot_config_v2.4.ini", QSettings.IniFormat) # Versão do ini atualizada

        self.contas_a_criar_lista = []
        self.indice_conta_atual = 0
        self.criacao_em_andamento = False
        self.intervalo_entre_criacoes_min = 60
        self.intervalo_entre_criacoes_max = 120
        self.caminho_foto_perfil_selecionada = None
        self.caminho_pasta_fotos_posts = None
        self.worker_atual_aguardando_codigo = None

        # --- NOVAS VARIÁVEIS DE ESTADO PARA TOGGLES ---
        self.ativar_foto_perfil_state = True
        self.ativar_bio_state = True
        self.ativar_posts_state = True
        # --- FIM DAS NOVAS VARIÁVEIS ---


        if Faker:
            self.fake = Faker('pt_BR')
            self.cidades_por_estado = {
                "Pernambuco": ["Recife", "Olinda", "Caruaru", "Petrolina", "Jaboatão dos Guararapes", "Paulista", "Garanhuns"],
                "São Paulo": ["São Paulo", "Guarulhos", "Campinas", "São Bernardo do Campo", "Santo André", "Osasco", "Santos"],
                "Rio de Janeiro": ["Rio de Janeiro", "São Gonçalo", "Duque de Caxias", "Nova Iguaçu", "Niterói", "Campos dos Goytacazes"],
                "Bahia": ["Salvador", "Feira de Santana", "Vitória da Conquista", "Camaçari", "Itabuna"],
                "Minas Gerais": ["Belo Horizonte", "Uberlândia", "Contagem", "Juiz de Fora", "Betim"]
            }
            self.signos = ["Áries ♈", "Touro ♉", "Gêmeos ♊", "Câncer ♋", "Leão ♌", "Virgem ♍", "Libra ♎", "Escorpião ♏", "Sagitário ♐", "Capricórnio ♑", "Aquário ♒", "Peixes ♓"]
            self.hobbies_atividades = ["Viajar ✈️", "Ler 📚", "Cozinhar 🍳", "Academia 💪", "Correr 🏃‍♀️", "Dançar 💃", "Música 🎧", "Filmes 🎬", "Games 🎮", "Praia 🏖️", "Trilhas 🏞️", "Fotografia 📸"]
            self.frases_bio = [
                "Vivendo um dia de cada vez ✨", "Apenas boas vibrações ✌️", "Em constante evolução 🌱",
                "Colecionando momentos 🌟", "Sonhe alto 💭", "Feito de sol e sal ☀️🌊", "Amante da natureza 🌳"
            ]
        else:
            self.fake = None
            self.cidades_por_estado = {}
            self.signos = ["Signo Exemplo"]
            self.hobbies_atividades = ["Hobby Exemplo"]
            self.frases_bio = ["Frase Exemplo"]

        self.nomes_usados_nesta_sessao = set()


        self.setWindowTitle("Bot Criador Contas Instagram v2.4 (Login Dolphin)")
        self.setGeometry(100, 100, 850, 750)
        try:
            icon_path = "assets/icon.png"
            if hasattr(sys, '_MEIPASS'):
                base_path = sys._MEIPASS
            else:
                # Se estiver rodando como script .py, pega o diretório do gui.py
                base_path = os.path.abspath(os.path.dirname(__file__))
            
            full_icon_path = os.path.join(base_path, icon_path)

            if not os.path.exists(full_icon_path):
                # Fallback para o diretório de trabalho atual, caso 'assets' esteja lá
                current_working_dir_base_path = os.path.abspath(".")
                full_icon_path_fallback = os.path.join(current_working_dir_base_path, icon_path)
                if os.path.exists(full_icon_path_fallback):
                    full_icon_path = full_icon_path_fallback
                else:
                    # print(f"Ícone não encontrado em: {full_icon_path} nem em {full_icon_path_fallback}") # Comentado para não poluir
                    full_icon_path = None # Ícone não encontrado

            if full_icon_path and os.path.exists(full_icon_path): # Verifica se full_icon_path não é None antes de os.path.exists
                self.setWindowIcon(QIcon(full_icon_path))
            elif not full_icon_path : # Se full_icon_path ficou None
                 pass # Não imprime nada se já imprimiu acima
            else: # Se full_icon_path foi definido mas não existe (caso raro, mas para cobrir)
                 print(f"Ícone não encontrado em: {full_icon_path}")

        except Exception as e:
            print(f"Erro ao carregar ícone: {e}")

        self.init_ui()
        # Populando informações iniciais
        self._populate_profiles_list() # Popula lista de perfis
        # A carga da lista de usuários será feita após a criação da tabela na interface

    def _handle_toggle_change(self, button_ref, is_checked, section_key, widget_toggle_function):
        if section_key == 'foto':
            self.ativar_foto_perfil_state = is_checked
        elif section_key == 'bio':
            self.ativar_bio_state = is_checked
        elif section_key == 'posts':
            self.ativar_posts_state = is_checked
        
        widget_toggle_function(is_checked)
        self._update_toggle_button_appearance(button_ref, is_checked, section_key)

    def _update_toggle_button_appearance(self, button_ref, is_checked, section_key_for_tooltip):
        section_name_map = {
            'foto': "Foto de Perfil",
            'bio': "Biografia",
            'posts': "Postagens"
        }
        section_display_name = section_name_map.get(section_key_for_tooltip, "esta seção")

        if is_checked:
            button_ref.setText("ATIVADO")
            button_ref.setStyleSheet(
                "background-color: #4CAF50; color: white; padding: 7px; "
                "border-radius: 5px; font-weight: bold; min-width: 110px;"
            )
            button_ref.setToolTip(f"A função '{section_display_name}' está ATIVADA. Clique para DESATIVAR.")
        else:
            button_ref.setText("DESATIVADO")
            button_ref.setStyleSheet(
                "background-color: #D3D3D3; color: #333333; padding: 7px; "
                "border-radius: 5px; font-weight: bold; min-width: 110px;"
            )
            button_ref.setToolTip(f"A função '{section_display_name}' está DESATIVADA. Clique para ATIVAR.")

    def init_ui(self):
        main_layout = QVBoxLayout(self)
        self.tab_widget = QTabWidget()

        # Aba Principal
        self.tab_principal = QWidget()
        scroll_area_principal = QScrollArea()
        scroll_area_principal.setWidgetResizable(True)
        scroll_area_principal.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        principal_container_widget = QWidget()
        layout_tab_principal = QVBoxLayout(principal_container_widget)

        header_label = QLabel("🤖 Bot Criador de Contas Instagram 🤖")
        header_label.setObjectName("header_label")
        layout_tab_principal.addWidget(header_label)

        senha_layout = QHBoxLayout()
        self.password_input = QLineEdit(placeholderText="Senha Padrão ou deixe vazio para aleatória", echoMode=QLineEdit.Password)
        senha_layout.addWidget(self.password_input, 2)
        self.senha_padrao_checkbox = QCheckBox("Usar Senha Padrão")
        self.senha_padrao_checkbox.setToolTip("Se marcado, usa a senha acima. Senão, gera senhas aleatórias.")
        self.senha_padrao_checkbox.setChecked(True)
        self.senha_padrao_checkbox.stateChanged.connect(self._toggle_password_input_enable)
        senha_layout.addWidget(self.senha_padrao_checkbox, 1)
        layout_tab_principal.addLayout(senha_layout)

        layout_tab_principal.addWidget(QLabel("🔢 Quantidade de Contas a Criar:"))
        self.quantity_input = QLineEdit("1")
        self.quantity_input.setValidator(QRegularExpressionValidator(QRegularExpression("[1-9][0-9]*")))
        layout_tab_principal.addWidget(self.quantity_input)

        self.manual_code_widget = QWidget()
        manual_code_layout = QHBoxLayout(self.manual_code_widget)
        manual_code_layout.setContentsMargins(0, 5, 0, 5)
        self.manual_code_input_label = QLabel("🔑 Código Manual:")
        manual_code_layout.addWidget(self.manual_code_input_label)
        self.manual_code_input = QLineEdit(placeholderText="Digite o código de 6 dígitos")
        self.manual_code_input.setValidator(QRegularExpressionValidator(QRegularExpression("[0-9]{0,6}")))
        self.manual_code_input.setMaxLength(6)
        manual_code_layout.addWidget(self.manual_code_input, 1)
        self.confirmar_codigo_button = QPushButton("Continuar")
        self.confirmar_codigo_button.setToolTip("Clique após inserir o código manual para continuar o processo.")
        self.confirmar_codigo_button.clicked.connect(self._enviar_codigo_manual)
        manual_code_layout.addWidget(self.confirmar_codigo_button)
        layout_tab_principal.addWidget(self.manual_code_widget)
        self.manual_code_widget.setVisible(False)

        botoes_acao_layout = QHBoxLayout()
        self.start_button = QPushButton("🚀 Iniciar Criação")
        self.start_button.clicked.connect(self.iniciar_processo_criacao_contas)
        botoes_acao_layout.addWidget(self.start_button)

        self.stop_button = QPushButton("🛑 Parar Tudo")
        self.stop_button.setObjectName("stop_button")
        self.stop_button.clicked.connect(self.parar_todos_workers)
        self.stop_button.setEnabled(False)
        botoes_acao_layout.addWidget(self.stop_button)
        layout_tab_principal.addLayout(botoes_acao_layout)

        layout_tab_principal.addWidget(QLabel("📜 Log de Status:"))
        self.status_text = QTextEdit(readOnly=True)
        layout_tab_principal.addWidget(self.status_text)
        layout_tab_principal.addStretch(1)

        principal_container_widget.setLayout(layout_tab_principal)
        scroll_area_principal.setWidget(principal_container_widget)
        self.tab_widget.addTab(scroll_area_principal, "🚀 Principal")

        # Aba Conteúdo do Perfil
        self.tab_conteudo_perfil = QWidget()
        scroll_area_conteudo = QScrollArea()
        scroll_area_conteudo.setWidgetResizable(True)
        scroll_area_conteudo.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        conteudo_container_widget = QWidget()
        layout_tab_conteudo = QVBoxLayout(conteudo_container_widget)

        self.foto_perfil_groupbox = QGroupBox("🖼️ Foto de Perfil")
        layout_foto_perfil_group = QVBoxLayout(self.foto_perfil_groupbox)
        self.toggle_foto_button = QPushButton()
        self.toggle_foto_button.setCheckable(True)
        self.toggle_foto_button.clicked.connect(
            lambda checked, b=self.toggle_foto_button, s_key='foto', w_toggle_func=self._toggle_foto_perfil_widgets:
                self._handle_toggle_change(b, checked, s_key, w_toggle_func)
        )
        layout_foto_perfil_group.addWidget(self.toggle_foto_button)
        foto_layout = QHBoxLayout()
        self.selecionar_foto_button = QPushButton("Selecionar Foto de Perfil")
        self.selecionar_foto_button.clicked.connect(self._selecionar_foto_perfil_dialog)
        foto_layout.addWidget(self.selecionar_foto_button)
        self.foto_preview_label = QLabel("Sem foto")
        self.foto_preview_label.setObjectName("foto_preview_label")
        self.foto_preview_label.setToolTip("Preview da foto selecionada")
        foto_layout.addWidget(self.foto_preview_label)
        foto_layout.addStretch(1)
        layout_foto_perfil_group.addLayout(foto_layout)
        layout_tab_conteudo.addWidget(self.foto_perfil_groupbox)

        self.bio_groupbox = QGroupBox("📝 Biografia")
        layout_bio_group = QVBoxLayout(self.bio_groupbox)
        self.toggle_bio_button = QPushButton()
        self.toggle_bio_button.setCheckable(True)
        self.toggle_bio_button.clicked.connect(
            lambda checked, b=self.toggle_bio_button, s_key='bio', w_toggle_func=self._toggle_bio_widgets:
                self._handle_toggle_change(b, checked, s_key, w_toggle_func)
        )
        layout_bio_group.addWidget(self.toggle_bio_button)
        layout_bio_group.addWidget(QLabel("Gênero para Bio (afeta pronomes/estilo):"))
        self.bio_genero_combo = QComboBox()
        self.bio_genero_combo.addItems(["Aleatório", "Masculino", "Feminino"])
        layout_bio_group.addWidget(self.bio_genero_combo)
        layout_bio_group.addWidget(QLabel("Estado (para cidade na bio):"))
        self.bio_estado_combo = QComboBox()
        self.bio_estado_combo.addItems(["Aleatório"] + sorted(list(self.cidades_por_estado.keys())))
        layout_bio_group.addWidget(self.bio_estado_combo)
        layout_bio_group.addWidget(QLabel("Atividade/Hobby:"))
        self.bio_atividade_input = QLineEdit(placeholderText="Ex: Crossfit, Leitura, Praia")
        layout_bio_group.addWidget(self.bio_atividade_input)
        layout_bio_group.addWidget(QLabel("Signo:"))
        self.bio_signo_combo = QComboBox()
        self.bio_signo_combo.addItems(["Aleatório"] + self.signos)
        layout_bio_group.addWidget(self.bio_signo_combo)
        layout_bio_group.addWidget(QLabel("Frase Curta:"))
        self.bio_frase_input = QLineEdit(placeholderText="Ex: Vivendo a vida intensamente!")
        layout_bio_group.addWidget(self.bio_frase_input)
        layout_bio_group.addWidget(QLabel("Contato na Bio (Opcional):"))
        self.bio_contato_input = QLineEdit(placeholderText="Ex: seuemail@contato.com ou (XX) XXXXX-XXXX")
        layout_bio_group.addWidget(self.bio_contato_input)
        self.bio_gerar_auto_checkbox = QCheckBox("Gerar Biografia Automaticamente")
        self.bio_gerar_auto_checkbox.setChecked(True)
        layout_bio_group.addWidget(self.bio_gerar_auto_checkbox)
        self.bio_preview_button = QPushButton("Gerar/Pré-visualizar Biografia")
        self.bio_preview_button.clicked.connect(self._gerar_e_preencher_bio_preview)
        layout_bio_group.addWidget(self.bio_preview_button)
        layout_bio_group.addWidget(QLabel("Texto da Biografia (Máx. 150 caracteres):"))
        self.bio_text_edit = QTextEdit()
        self.bio_text_edit.setFixedHeight(80)
        self.bio_text_edit.setPlaceholderText("A biografia gerada ou digitada manualmente aparecerá aqui.")
        layout_bio_group.addWidget(self.bio_text_edit)
        layout_tab_conteudo.addWidget(self.bio_groupbox)

        self.posts_groupbox = QGroupBox("🏞️ Postagens de Fotos")
        layout_posts_group = QVBoxLayout(self.posts_groupbox)
        self.toggle_posts_button = QPushButton()
        self.toggle_posts_button.setCheckable(True)
        self.toggle_posts_button.clicked.connect(
            lambda checked, b=self.toggle_posts_button, s_key='posts', w_toggle_func=self._toggle_posts_widgets:
                self._handle_toggle_change(b, checked, s_key, w_toggle_func)
        )
        layout_posts_group.addWidget(self.toggle_posts_button)
        self.selecionar_pasta_fotos_button = QPushButton("Selecionar Pasta com Fotos para Postar")
        self.selecionar_pasta_fotos_button.clicked.connect(self._selecionar_pasta_fotos_dialog)
        layout_posts_group.addWidget(self.selecionar_pasta_fotos_button)
        self.pasta_fotos_path_label = QLineEdit(placeholderText="Nenhuma pasta selecionada")
        self.pasta_fotos_path_label.setReadOnly(True)
        layout_posts_group.addWidget(self.pasta_fotos_path_label)
        layout_posts_group.addWidget(QLabel("Número de fotos a postar (0 para nenhuma):"))
        self.num_fotos_postar_spinbox = QSpinBox(minimum=0, maximum=20, value=0)
        layout_posts_group.addWidget(self.num_fotos_postar_spinbox)
        layout_posts_group.addWidget(QLabel("Intervalo entre Posts (segundos):"))
        self.intervalo_posts_input = QLineEdit("5")
        self.intervalo_posts_input.setValidator(QRegularExpressionValidator(QRegularExpression("[1-9][0-9]*")))
        layout_posts_group.addWidget(self.intervalo_posts_input)
        layout_tab_conteudo.addWidget(self.posts_groupbox)
        layout_tab_conteudo.addStretch(1)
        conteudo_container_widget.setLayout(layout_tab_conteudo)
        scroll_area_conteudo.setWidget(conteudo_container_widget)
        self.tab_widget.addTab(scroll_area_conteudo, "🖼️ Conteúdo do Perfil")

        # Aba Configurações Gerais
        self.tab_configuracoes = QWidget()
        scroll_area_config_geral = QScrollArea()
        scroll_area_config_geral.setWidgetResizable(True)
        scroll_area_config_geral.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        config_geral_container_widget = QWidget()
        layout_tab_config_geral = QVBoxLayout(config_geral_container_widget)

        lista_emails_label = QLabel("📧 Lista de E-mails (um por linha):")
        lista_emails_label.setObjectName("sidebar_section_label")
        layout_tab_config_geral.addWidget(lista_emails_label)
        self.emails_list_input = QTextEdit()
        self.emails_list_input.setPlaceholderText("email1@dominio.com\nalias2@dominio.com\noutroemail@site.com")
        self.emails_list_input.setFixedHeight(100)
        layout_tab_config_geral.addWidget(self.emails_list_input)

        nome_config_label = QLabel("🧑 Configurações de Nome e Usuário:")
        nome_config_label.setObjectName("sidebar_section_label")
        layout_tab_config_geral.addWidget(nome_config_label)
        layout_tab_config_geral.addWidget(QLabel("Gênero para Nomes Aleatórios:"))
        self.genero_combo = QComboBox()
        self.genero_combo.addItems(["Aleatório", "Masculino", "Feminino"])
        self.genero_combo.currentTextChanged.connect(self._sincronizar_genero_bio)
        layout_tab_config_geral.addWidget(self.genero_combo)
        self.gerar_nome_usuario_button = QPushButton("Gerar Nome e Usuário (Preencher Campos)")
        self.gerar_nome_usuario_button.setToolTip("Gera um nome e usuário e preenche os campos abaixo e na aba 'Principal'")
        self.gerar_nome_usuario_button.clicked.connect(self._gerar_e_preencher_nome_usuario_realtime)
        layout_tab_config_geral.addWidget(self.gerar_nome_usuario_button)
        layout_tab_config_geral.addWidget(QLabel("Nome Completo Manual (Usado se preenchido para a 1ª conta ou se qtd=1):"))
        self.manual_fullname_input = QLineEdit(placeholderText="Preencha ou use o botão 'Gerar'")
        layout_tab_config_geral.addWidget(self.manual_fullname_input)
        layout_tab_config_geral.addWidget(QLabel("Nome de Usuário Base (Opcional, usado com nome manual ou 1ª conta):"))
        self.username_input_config = QLineEdit(placeholderText="Deixe vazio para gerar do nome completo")
        layout_tab_config_geral.addWidget(self.username_input_config)

        idade_label = QLabel("🎂 Idade / Data de Nascimento:")
        idade_label.setObjectName("sidebar_section_label")
        layout_tab_config_geral.addWidget(idade_label)
        self.idade_modo_combo = QComboBox()
        self.idade_modo_combo.addItems(["Definir Data Manualmente", "Gerar Idade em Intervalo"])
        self.idade_modo_combo.currentIndexChanged.connect(self._toggle_campos_idade)
        layout_tab_config_geral.addWidget(self.idade_modo_combo)
        self.data_manual_widget = QWidget()
        data_manual_layout = QHBoxLayout(self.data_manual_widget)
        data_manual_layout.setContentsMargins(0,0,0,0)
        self.dia_input = QSpinBox(minimum=1, maximum=31)
        self.mes_input = QSpinBox(minimum=1, maximum=12)
        self.ano_input = QSpinBox(minimum=1920, maximum=datetime.now().year - 13, value=2000)
        for w, label_text in [(self.dia_input, "Dia:"), (self.mes_input, "Mês:"), (self.ano_input, "Ano:")]:
            temp_layout = QVBoxLayout(); temp_layout.addWidget(QLabel(label_text)); temp_layout.addWidget(w); data_manual_layout.addLayout(temp_layout)
        layout_tab_config_geral.addWidget(self.data_manual_widget)
        self.intervalo_idade_widget = QWidget()
        intervalo_idade_layout = QHBoxLayout(self.intervalo_idade_widget)
        intervalo_idade_layout.setContentsMargins(0,0,0,0)
        self.idade_min_input = QSpinBox(minimum=13, maximum=99, value=18)
        self.idade_max_input = QSpinBox(minimum=13, maximum=99, value=45)
        temp_min_layout = QVBoxLayout(); temp_min_layout.addWidget(QLabel("Idade Mín:")); temp_min_layout.addWidget(self.idade_min_input)
        temp_max_layout = QVBoxLayout(); temp_max_layout.addWidget(QLabel("Idade Máx:")); temp_max_layout.addWidget(self.idade_max_input)
        intervalo_idade_layout.addLayout(temp_min_layout)
        intervalo_idade_layout.addLayout(temp_max_layout)
        layout_tab_config_geral.addWidget(self.intervalo_idade_widget)
        self.intervalo_idade_widget.setVisible(False)

        email_imap_label = QLabel("📧 Credenciais do E-mail e Consulta de Código:")
        email_imap_label.setObjectName("sidebar_section_label")
        layout_tab_config_geral.addWidget(email_imap_label)
        self.consultar_email_auto_checkbox = QCheckBox("Consultar Código no E-mail Automaticamente")
        self.consultar_email_auto_checkbox.setChecked(True)
        self.consultar_email_auto_checkbox.stateChanged.connect(self._toggle_manual_code_input)
        layout_tab_config_geral.addWidget(self.consultar_email_auto_checkbox)
        layout_tab_config_geral.addWidget(QLabel("Usuário/Login do E-mail (IMAP Hostinger):"))
        self.email_user_input = QLineEdit(placeholderText="Ex: seu_email@seudominio.com")
        layout_tab_config_geral.addWidget(self.email_user_input)
        layout_tab_config_geral.addWidget(QLabel("Senha do E-mail (IMAP Hostinger):"))
        self.email_senha_input = QLineEdit(echoMode=QLineEdit.Password, placeholderText="Senha do seu e-mail IMAP")
        layout_tab_config_geral.addWidget(self.email_senha_input)

        interval_label = QLabel("⏱️ Intervalos (segundos):")
        interval_label.setObjectName("sidebar_section_label")
        layout_tab_config_geral.addWidget(interval_label)
        layout_tab_config_geral.addWidget(QLabel("Entre CRIAÇÕES de contas (ex: 60 ou 60-120):"))
        self.intervalo_criacao_input = QLineEdit("60-120", placeholderText="Ex: 60 ou 60-120")
        layout_tab_config_geral.addWidget(self.intervalo_criacao_input)
        layout_tab_config_geral.addWidget(QLabel("Para buscar código no e-mail (ex: 10):"))
        self.intervalo_email_input = QLineEdit("10", placeholderText="Ex: 10")
        layout_tab_config_geral.addWidget(self.intervalo_email_input)

        # --- Adicionar Seleção de Navegador ---
        navegador_label = QLabel("🌐 Navegador para Automação:")
        navegador_label.setObjectName("sidebar_section_label")
        layout_tab_config_geral.addWidget(navegador_label)
        self.navegador_combo = QComboBox()
        self.navegador_combo.addItems(["Chrome", "Edge", "Firefox"])
        layout_tab_config_geral.addWidget(self.navegador_combo)

        self.salvar_button = QPushButton("💾 Salvar Configurações")
        self.salvar_button.setObjectName("salvar_button")
        self.salvar_button.clicked.connect(self.salvar_configuracoes)
        layout_tab_config_geral.addWidget(self.salvar_button)
        layout_tab_config_geral.addStretch(1)

        config_geral_container_widget.setLayout(layout_tab_config_geral)
        scroll_area_config_geral.setWidget(config_geral_container_widget)
        self.tab_widget.addTab(scroll_area_config_geral, "⚙️ Configurações Gerais")

        # --- Aba Dolphin Anty ---
        # Criar widget de scroll para toda a aba
        scroll_area_dolphin = QScrollArea()
        scroll_area_dolphin.setWidgetResizable(True)
        scroll_area_dolphin.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        dolphin_container_widget = QWidget()
        layout_tab_dolphin = QVBoxLayout(dolphin_container_widget)

        dolphin_header_label = QLabel("🐬 Perfis Gerenciados (Estilo Dolphin Anty) 🐬")
        dolphin_header_label.setObjectName("header_label") # Usar mesmo estilo do header principal
        dolphin_header_label.setStyleSheet("font-size: 18px; margin-bottom: 10px;") # Ajuste leve
        layout_tab_dolphin.addWidget(dolphin_header_label)
        
        # Painel de Estatísticas dos Perfis
        stats_groupbox = QGroupBox("Estatísticas de Perfis")
        stats_layout = QHBoxLayout()
        
        # Layout para perfis ativos
        ativos_layout = QVBoxLayout()
        self.perfis_ativos_icon = QLabel("✅")
        self.perfis_ativos_icon.setStyleSheet("font-size: 24px;")
        self.perfis_ativos_label = QLabel("Perfis Ativos")
        self.perfis_ativos_count = QLabel("0")
        self.perfis_ativos_count.setStyleSheet("font-size: 18px; font-weight: bold; color: green;")
        ativos_layout.addWidget(self.perfis_ativos_icon, alignment=Qt.AlignCenter)
        ativos_layout.addWidget(self.perfis_ativos_label, alignment=Qt.AlignCenter)
        ativos_layout.addWidget(self.perfis_ativos_count, alignment=Qt.AlignCenter)
        
        # Layout para perfis conectados (acesso limitado)
        conectados_layout = QVBoxLayout()
        self.perfis_conectados_icon = QLabel("⚠️")
        self.perfis_conectados_icon.setStyleSheet("font-size: 24px;")
        self.perfis_conectados_label = QLabel("Acesso Limitado")
        self.perfis_conectados_count = QLabel("0")
        self.perfis_conectados_count.setStyleSheet("font-size: 18px; font-weight: bold; color: orange;")
        conectados_layout.addWidget(self.perfis_conectados_icon, alignment=Qt.AlignCenter)
        conectados_layout.addWidget(self.perfis_conectados_label, alignment=Qt.AlignCenter)
        conectados_layout.addWidget(self.perfis_conectados_count, alignment=Qt.AlignCenter)
        
        # Layout para perfis com erro
        erro_layout = QVBoxLayout()
        self.perfis_erro_icon = QLabel("❌")
        self.perfis_erro_icon.setStyleSheet("font-size: 24px;")
        self.perfis_erro_label = QLabel("Erro de Login")
        self.perfis_erro_count = QLabel("0")
        self.perfis_erro_count.setStyleSheet("font-size: 18px; font-weight: bold; color: red;")
        erro_layout.addWidget(self.perfis_erro_icon, alignment=Qt.AlignCenter)
        erro_layout.addWidget(self.perfis_erro_label, alignment=Qt.AlignCenter)
        erro_layout.addWidget(self.perfis_erro_count, alignment=Qt.AlignCenter)
        
        # Layout para total de perfis
        total_layout = QVBoxLayout()
        self.perfis_total_icon = QLabel("📊")
        self.perfis_total_icon.setStyleSheet("font-size: 24px;")
        self.perfis_total_label = QLabel("Total de Perfis")
        self.perfis_total_count = QLabel("0")
        self.perfis_total_count.setStyleSheet("font-size: 18px; font-weight: bold;")
        total_layout.addWidget(self.perfis_total_icon, alignment=Qt.AlignCenter)
        total_layout.addWidget(self.perfis_total_label, alignment=Qt.AlignCenter)
        total_layout.addWidget(self.perfis_total_count, alignment=Qt.AlignCenter)
        
        # Layout horizontal para os contadores
        stats_layout.addLayout(ativos_layout)
        stats_layout.addLayout(conectados_layout)
        stats_layout.addLayout(erro_layout)
        stats_layout.addLayout(total_layout)
        
        # Layout para o conteúdo do GroupBox
        stats_main_layout = QVBoxLayout()
        stats_main_layout.addLayout(stats_layout)  # Adiciona os contadores
        
        # Criação do botão de reset - de forma simplificada
        self.stats_reset_button = QPushButton("🔄 Resetar Estatísticas")
        self.stats_reset_button.setToolTip("Limpar contadores de estatísticas")
        self.stats_reset_button.clicked.connect(self._resetar_estatisticas)
        self.stats_reset_button.setCursor(Qt.PointingHandCursor)  # Muda o cursor para mão
        self.stats_reset_button.setStyleSheet("""
            QPushButton {
                background-color: #8E44AD;
                color: white;
                padding: 8px;
                border-radius: 4px;
                font-weight: bold;
                margin-top: 10px;
            }
            QPushButton:hover {
                background-color: #9B59B6;
            }
        """)
        
        # Adiciona o botão diretamente ao layout principal
        stats_main_layout.addWidget(self.stats_reset_button)
        
        # Define o layout do GroupBox
        stats_groupbox.setLayout(stats_main_layout)
        layout_tab_dolphin.addWidget(stats_groupbox)

        # --- Seção para Cadastrar Conta Manualmente ---
        manual_profile_groupbox = QGroupBox("Cadastrar Nova Conta no Dolphin")
        manual_profile_layout = QVBoxLayout()

        # Layout horizontal para organizar os campos de usuário e senha lado a lado
        campos_login_layout = QHBoxLayout()

        # Container para campo de usuário
        user_container = QVBoxLayout()
        manual_profile_user_label = QLabel("Usuário Instagram:")
        self.manual_profile_user_input = QLineEdit()
        self.manual_profile_user_input.setPlaceholderText("Digite o nome de usuário")
        user_container.addWidget(manual_profile_user_label)
        user_container.addWidget(self.manual_profile_user_input)
        campos_login_layout.addLayout(user_container)

        # Container para campo de senha
        pass_container = QVBoxLayout()
        manual_profile_pass_label = QLabel("Senha Instagram:")
        self.manual_profile_pass_input = QLineEdit()
        self.manual_profile_pass_input.setEchoMode(QLineEdit.Password)
        self.manual_profile_pass_input.setPlaceholderText("Digite a senha da conta")
        pass_container.addWidget(manual_profile_pass_label)
        pass_container.addWidget(self.manual_profile_pass_input)
        campos_login_layout.addLayout(pass_container)

        # Adiciona o layout de campos ao layout principal da seção
        manual_profile_layout.addLayout(campos_login_layout)

        # Contador de perfis (novo)
        perfis_info_layout = QHBoxLayout()
        self.perfis_count_label = QLabel("Perfis cadastrados: 0")
        self.perfis_count_label.setStyleSheet("font-size: 12px; color: #aaaaaa; margin-top: 5px;")
        perfis_info_layout.addWidget(self.perfis_count_label)
        perfis_info_layout.addStretch()
        manual_profile_layout.addLayout(perfis_info_layout)
        
        # Botões para cadastro manual e importação de TXT
        botoes_cadastro_layout = QHBoxLayout()
        self.cadastrar_manual_profile_button = QPushButton("➕ Cadastrar Conta")
        self.cadastrar_manual_profile_button.clicked.connect(self._cadastrar_conta_manual_dolphin)
        botoes_cadastro_layout.addWidget(self.cadastrar_manual_profile_button)

        self.importar_txt_button = QPushButton("📄 Importar de TXT")
        self.importar_txt_button.setToolTip("Importar usuários e senhas de arquivo TXT no formato: usuario,senha")
        self.importar_txt_button.clicked.connect(self._importar_usuarios_txt)
        botoes_cadastro_layout.addWidget(self.importar_txt_button)
        
        # Botão para limpar a lista (novo)
        self.limpar_perfis_button = QPushButton("🗑️ Limpar Lista")
        self.limpar_perfis_button.setToolTip("Limpar todos os perfis cadastrados")
        self.limpar_perfis_button.clicked.connect(self._limpar_lista_perfis)
        self.limpar_perfis_button.setStyleSheet("""
            QPushButton {
                background-color: #752222;
                color: white;
                border-radius: 4px;
                padding: 5px;
            }
            QPushButton:hover {
                background-color: #9c2929;
            }
            QPushButton:pressed {
                background-color: #5a1a1a;
            }
        """)
        botoes_cadastro_layout.addWidget(self.limpar_perfis_button)

        manual_profile_layout.addLayout(botoes_cadastro_layout)
        manual_profile_groupbox.setLayout(manual_profile_layout)
        layout_tab_dolphin.addWidget(manual_profile_groupbox)
        # --- Fim da Seção ---

        # Seção da lista de perfis
        perfis_groupbox = QGroupBox("Perfis Salvos")
        perfis_layout = QVBoxLayout()

        # Texto de instrução para a lista de perfis
        instrucao_label = QLabel("Clique em um perfil para selecionar e depois em 'Entrar' para abrir o navegador.")
        instrucao_label.setStyleSheet("font-size: 12px; color: #aaaaaa;")
        perfis_layout.addWidget(instrucao_label)
        
        # Campo de pesquisa de perfis
        search_layout = QHBoxLayout()
        search_icon_label = QLabel("🔍")
        search_icon_label.setStyleSheet("font-size: 16px;")
        search_layout.addWidget(search_icon_label)
        
        self.profile_search_input = QLineEdit()
        self.profile_search_input.setPlaceholderText("Pesquisar perfis...")
        self.profile_search_input.setStyleSheet("""
            QLineEdit {
                background-color: #2a2a2a;
                color: #e0e0e0;
                border: 1px solid #3D2F5B;
                border-radius: 4px;
                padding: 6px;
            }
            QLineEdit:focus {
                border: 1px solid #8E44AD;
            }
        """)
        self.profile_search_input.textChanged.connect(self._filtrar_perfis)
        search_layout.addWidget(self.profile_search_input)
        
        # Botão para limpar a pesquisa
        self.clear_search_button = QPushButton("\u2715")  # × (símbolo X)
        self.clear_search_button.setToolTip("Limpar pesquisa")
        self.clear_search_button.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                color: #999;
                border: none;
                padding: 2px 5px;
                font-weight: bold;
            }
            QPushButton:hover {
                color: white;
            }
        """)
        self.clear_search_button.setCursor(Qt.PointingHandCursor)
        self.clear_search_button.clicked.connect(lambda: self.profile_search_input.clear())
        search_layout.addWidget(self.clear_search_button)
        
        perfis_layout.addLayout(search_layout)

        # Lista de perfis
        self.profiles_list_widget = QListWidget()
        self.profiles_list_widget.setSelectionMode(QListWidget.SingleSelection)
        self.profiles_list_widget.setAlternatingRowColors(True)
        self.profiles_list_widget.itemDoubleClicked.connect(self._launch_selected_profile)
        self.profiles_list_widget.setStyleSheet("""
            QListWidget { border: 1px solid #333; border-radius: 4px; }
            QListWidget::item { padding: 5px; }
            QListWidget::item:selected { background-color: #3D2F5B; }
            QListWidget::item:alternate { background-color: #232323; }
        """)
        perfis_layout.addWidget(self.profiles_list_widget)

        # Botão único de login universal
        print("[DEBUG] Criando botão de login universal")
        self.login_perfil_button = QPushButton("Entrar no Perfil Selecionado 🚪")
        self.login_perfil_button.setEnabled(False)  # Desativado até que um perfil seja selecionado
        self.login_perfil_button.clicked.connect(self._login_perfil_selecionado)
        print("[DEBUG] Botão de login conectado ao método _login_perfil_selecionado")
        self.login_perfil_button.setStyleSheet("""
            QPushButton {
                background-color: #8E44AD;
                color: white;
                padding: 8px;
                border-radius: 4px;
                font-weight: bold;
            }
            QPushButton:disabled {
                background-color: #555;
                color: #888;
            }
        """)
        perfis_layout.addWidget(self.login_perfil_button)

        # Layout para agrupar botões de gestão da lista
        botoes_lista_layout = QHBoxLayout()
        
        # Botão para atualizar a lista
        self.refresh_profiles_button = QPushButton("🔄 Atualizar Lista")
        self.refresh_profiles_button.clicked.connect(self._populate_profiles_list)
        self.refresh_profiles_button.setStyleSheet("""
            QPushButton {
                background-color: #3D2F5B;
                color: white;
                padding: 8px;
                border-radius: 4px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #533D7A;
            }
        """)
        botoes_lista_layout.addWidget(self.refresh_profiles_button)
        
        # Botão para limpar a lista
        self.limpar_lista_button = QPushButton("🗑️ Limpar Lista")
        self.limpar_lista_button.setToolTip("Remover todos os perfis cadastrados")
        self.limpar_lista_button.clicked.connect(self._limpar_lista_perfis)
        self.limpar_lista_button.setStyleSheet("""
            QPushButton {
                background-color: #752222;
                color: white;
                padding: 8px;
                border-radius: 4px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #9c2929;
            }
        """)
        botoes_lista_layout.addWidget(self.limpar_lista_button)
        
        # Botão para limpar arquivos temporários
        self.limpar_temp_button = QPushButton("🚮 Limpar Temporários")
        self.limpar_temp_button.setToolTip("Remover arquivos temporários e cache sem afetar perfis conectados")
        self.limpar_temp_button.clicked.connect(self._limpar_arquivos_temporarios)
        self.limpar_temp_button.setStyleSheet("""
            QPushButton {
                background-color: #2c3e50;
                color: white;
                padding: 8px;
                border-radius: 4px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #34495e;
            }
        """)
        botoes_lista_layout.addWidget(self.limpar_temp_button)
        
        # Adiciona o layout de botões ao layout principal
        perfis_layout.addLayout(botoes_lista_layout)
        
        perfis_groupbox.setLayout(perfis_layout)
        layout_tab_dolphin.addWidget(perfis_groupbox)
        
        # --- Nova Seção de Teste de Login ---
        teste_login_groupbox = QGroupBox("🔑 Teste de Login de Contas")
        teste_login_layout = QVBoxLayout()
        
        # Descrição da funcionalidade
        teste_login_desc_label = QLabel("Importe uma lista de usuários e senhas para testar login no Instagram. Um perfil será testado por vez.")
        teste_login_desc_label.setStyleSheet("font-size: 12px; color: #aaaaaa;")
        teste_login_desc_label.setWordWrap(True)
        teste_login_layout.addWidget(teste_login_desc_label)
        
        # Botão para importar lista de usuários de um arquivo TXT
        # Layout para botões de importar e limpar lista
        botoes_teste_login_layout = QHBoxLayout()
        
        # Botão para importar lista
        self.importar_lista_login_button = QPushButton("📝 Importar Lista de Usuários (TXT)")
        self.importar_lista_login_button.setToolTip("Importar usuários e senhas de arquivo TXT no formato: usuario,senha")
        self.importar_lista_login_button.clicked.connect(self._importar_lista_login)
        botoes_teste_login_layout.addWidget(self.importar_lista_login_button)
        
        # Botão para limpar lista
        self.limpar_lista_contas_button = QPushButton("🗑️ Limpar Lista")
        self.limpar_lista_contas_button.setToolTip("Remover todas as contas da lista de teste")
        self.limpar_lista_contas_button.clicked.connect(self._limpar_lista_contas_teste)
        self.limpar_lista_contas_button.setStyleSheet("""
            QPushButton {
                background-color: #c0392b;
                color: white;
                padding: 5px;
                border-radius: 3px;
            }
            QPushButton:hover {
                background-color: #e74c3c;
            }
        """)
        botoes_teste_login_layout.addWidget(self.limpar_lista_contas_button)
        
        teste_login_layout.addLayout(botoes_teste_login_layout)
        
        # Tabela para exibir usuários, senhas e status
        teste_login_layout.addWidget(QLabel("Lista de Contas para Teste:"))
        self.tabela_usuarios = QTableWidget(0, 3)  # 3 colunas: Usuário, Senha, Status
        self.tabela_usuarios.setHorizontalHeaderLabels(["Usuário", "Senha", "Status"])
        self.tabela_usuarios.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.tabela_usuarios.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.tabela_usuarios.setEditTriggers(QAbstractItemView.NoEditTriggers)  # Tabela não editável
        self.tabela_usuarios.setAlternatingRowColors(True)
        teste_login_layout.addWidget(self.tabela_usuarios)
        
        # Carregar a lista de usuários depois que a tabela foi criada
        self._carregar_lista_usuarios()
        
        # Botão para iniciar o teste de login
        self.iniciar_teste_login_button = QPushButton("▶️ Iniciar Teste de Login")
        self.iniciar_teste_login_button.clicked.connect(self._iniciar_teste_login)
        teste_login_layout.addWidget(self.iniciar_teste_login_button)
        
        # Status do teste
        teste_login_layout.addWidget(QLabel("Status do Teste:"))
        self.teste_login_status_label = QLabel("Aguardando início do teste...")
        self.teste_login_status_label.setStyleSheet("font-weight: bold; color: #aaaaaa;")
        teste_login_layout.addWidget(self.teste_login_status_label)
        
        # Barra de progresso
        self.teste_login_progress_label = QLabel("Progresso: 0/0")
        teste_login_layout.addWidget(self.teste_login_progress_label)
        
        # Lista de resultados
        teste_login_layout.addWidget(QLabel("Resultados dos Testes:"))
        self.teste_login_resultados_list = QListWidget()
        self.teste_login_resultados_list.setAlternatingRowColors(True)
        self.teste_login_resultados_list.setStyleSheet("""
            QListWidget { border: 1px solid #333; border-radius: 4px; max-height: 150px; }
            QListWidget::item { padding: 5px; }
            QListWidget::item:alternate { background-color: #232323; }
        """)
        teste_login_layout.addWidget(self.teste_login_resultados_list)
        
        # Layout para botões de verificação de login manual
        self.teste_login_botoes_layout = QVBoxLayout()
        teste_login_layout.addLayout(self.teste_login_botoes_layout)

        teste_login_groupbox.setLayout(teste_login_layout)
        layout_tab_dolphin.addWidget(teste_login_groupbox)
        
        # --- Nova Seção de Automação de Ações ---
        automacao_groupbox = QGroupBox("🤖 Automação de Ações em Posts")
        automacao_layout = QVBoxLayout()
        
        # Descrição da funcionalidade
        automacao_desc_label = QLabel("Configure e automatize ações como curtir e comentar em posts do Instagram usando seus perfis.")
        automacao_desc_label.setStyleSheet("font-size: 12px; color: #aaaaaa;")
        automacao_desc_label.setWordWrap(True)
        automacao_layout.addWidget(automacao_desc_label)
        
        # Campo para URL do post
        post_url_layout = QHBoxLayout()
        post_url_label = QLabel("URL do Post:")
        self.post_url_input = QLineEdit()
        self.post_url_input.setPlaceholderText("Cole aqui a URL do post do Instagram")
        post_url_layout.addWidget(post_url_label)
        post_url_layout.addWidget(self.post_url_input)
        automacao_layout.addLayout(post_url_layout)
        
        # Layout para configurações de automação
        config_automacao_layout = QHBoxLayout()
        
        # Quantidade de ações
        acoes_layout = QVBoxLayout()
        acoes_label = QLabel("Quantidade de Ações:")
        self.acoes_spinbox = QSpinBox()
        self.acoes_spinbox.setMinimum(1)
        self.acoes_spinbox.setMaximum(1000)
        self.acoes_spinbox.setValue(5)
        acoes_layout.addWidget(acoes_label)
        acoes_layout.addWidget(self.acoes_spinbox)
        config_automacao_layout.addLayout(acoes_layout)
        
        # Perfis simultâneos
        perfis_simult_layout = QVBoxLayout()
        perfis_simult_label = QLabel("Perfis Simultâneos:")
        self.perfis_simult_spinbox = QSpinBox()
        self.perfis_simult_spinbox.setMinimum(1)
        self.perfis_simult_spinbox.setMaximum(10)
        self.perfis_simult_spinbox.setValue(2)
        perfis_simult_layout.addWidget(perfis_simult_label)
        perfis_simult_layout.addWidget(self.perfis_simult_spinbox)
        config_automacao_layout.addLayout(perfis_simult_layout)
        
        # Tempo entre ações (segundos)
        tempo_acoes_layout = QVBoxLayout()
        tempo_acoes_label = QLabel("Tempo entre Ações (seg):")
        self.tempo_acoes_spinbox = QSpinBox()
        self.tempo_acoes_spinbox.setMinimum(5)
        self.tempo_acoes_spinbox.setMaximum(60)
        self.tempo_acoes_spinbox.setValue(5)
        tempo_acoes_layout.addWidget(tempo_acoes_label)
        tempo_acoes_layout.addWidget(self.tempo_acoes_spinbox)
        config_automacao_layout.addLayout(tempo_acoes_layout)
        
        automacao_layout.addLayout(config_automacao_layout)
        
        # Checkboxes para ações
        acoes_checkbox_layout = QHBoxLayout()
        acoes_checkbox_layout.addWidget(QLabel("Ações a realizar:"))
        self.curtir_checkbox = QCheckBox("Curtir")
        self.curtir_checkbox.setChecked(True)
        self.comentar_checkbox = QCheckBox("Comentar")
        # Conectar a checkbox de comentar para habilitar/desabilitar o campo de texto
        self.comentar_checkbox.stateChanged.connect(self._toggle_comentario_input)
        acoes_checkbox_layout.addWidget(self.curtir_checkbox)
        acoes_checkbox_layout.addWidget(self.comentar_checkbox)
        acoes_checkbox_layout.addStretch(1)
        automacao_layout.addLayout(acoes_checkbox_layout)
        
        # Campo de texto maior para os comentários (múltiplos)
        comentario_layout = QVBoxLayout()
        comentario_label = QLabel("Insira os comentários (um por linha):")
        self.comentario_input = QTextEdit()
        self.comentario_input.setMinimumHeight(100)  # Altura mínima para mostrar várias linhas
        self.comentario_input.setPlaceholderText("Digite vários comentários, um em cada linha.\nO bot escolherá um aleatoriamente para cada perfil.")
        self.comentario_input.setEnabled(False)
        comentario_layout.addWidget(comentario_label)
        comentario_layout.addWidget(self.comentario_input)
        automacao_layout.addLayout(comentario_layout)
        
        # Botão para iniciar automação
        self.iniciar_automacao_button = QPushButton("▶️ Iniciar Automação")
        self.iniciar_automacao_button.clicked.connect(self._iniciar_automacao_acoes)
        self.iniciar_automacao_button.setStyleSheet("""
            QPushButton {
                background-color: #27ae60;
                color: white;
                padding: 8px;
                border-radius: 4px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #2ecc71;
            }
            QPushButton:disabled {
                background-color: #555;
                color: #888;
            }
        """)
        automacao_layout.addWidget(self.iniciar_automacao_button)
        
        # Progresso da automação
        progresso_layout = QHBoxLayout()
        progresso_label = QLabel("Progresso:")
        self.progresso_automacao_label = QLabel("0/0 ações concluídas")
        progresso_layout.addWidget(progresso_label)
        progresso_layout.addWidget(self.progresso_automacao_label)
        progresso_layout.addStretch(1)
        automacao_layout.addLayout(progresso_layout)
        
        automacao_groupbox.setLayout(automacao_layout)
        layout_tab_dolphin.addWidget(automacao_groupbox)

        # Finalizar a configuração da área de scroll
        scroll_area_dolphin.setWidget(dolphin_container_widget)
        self.tab_dolphin_anty = scroll_area_dolphin
        self.tab_widget.addTab(self.tab_dolphin_anty, "🐬 Dolphin Anty")

        main_layout.addWidget(self.tab_widget)

        self.setStyleSheet("""
            QWidget {
                background-color: #1c1c1c;
                color: #e0e0e0;
                font-family: Segoe UI, Arial;
                font-size: 14px;
            }
            QLabel {
                font-size: 15px;
                color: #f0f0f0;
                margin-bottom: 4px;
                font-weight: normal;
            }
            QLabel#header_label {
                font-size: 22px;
                font-weight: bold;
                margin-bottom: 18px;
                color: #ffffff;
                qproperty-alignment: 'AlignCenter';
            }
            QLineEdit, QSpinBox, QComboBox, QTextEdit#emails_list_input, QTextEdit#bio_text_edit {
                background-color: #333333;
                border: 1px solid #555555;
                border-radius: 5px;
                padding: 9px;
                color: #ffffff;
                margin-bottom: 12px;
                selection-background-color: #3897f0;
            }
            QTextEdit { /* Área de Log */
                background-color: #252525;
                border: 1px solid #404040;
                border-radius: 5px;
                color: #d0d0d0;
                padding: 10px;
                margin-top: 10px;
                min-height: 120px;
                font-size: 13px;
                font-family: Consolas, Courier New, monospace;
                white-space: pre-wrap;
            }
            QComboBox QAbstractItemView {
                background-color: #333333;
                color: #ffffff;
                selection-background-color: #3897f0;
                border-radius: 5px;
            }
            QSpinBox::up-button, QSpinBox::down-button {
                width: 22px;
                background-color: #4a4a4a;
                border-radius: 2px;
            }
            QSpinBox::up-arrow, QSpinBox::down-arrow {
                color: #c0c0c0;
            }
            QPushButton {
                background-color: #C13584;
                color: white;
                border-radius: 5px;
                padding: 11px;
                font-size: 15px;
                font-weight: bold;
                margin-top: 6px;
                margin-bottom: 6px;
                border: none;
            }
            QPushButton:hover {
                background-color: #E1306C;
            }
            QPushButton:pressed {
                background-color: #833AB4;
            }
            QPushButton:disabled {
                background-color: #4E5052;
                color: #888888;
            }
            QPushButton#salvar_button { background-color: #4CAF50; }
            QPushButton#salvar_button:hover { background-color: #66bb6a; }
            QPushButton#salvar_button:pressed { background-color: #388E3C; }
            QPushButton#stop_button { background-color: #f44336; }
            QPushButton#stop_button:hover { background-color: #f6685e; }
            QPushButton#stop_button:pressed { background-color: #d32f2f; }
            QCheckBox {
                color: #e0e0e0;
                margin-bottom: 8px;
                spacing: 5px;
            }
            QCheckBox::indicator {
                width: 18px;
                height: 18px;
                border-radius: 3px;
                background-color: #333333;
                border: 1px solid #555555;
            }
            QCheckBox::indicator:checked {
                background-color: #C13584;
                border: 1px solid #C13584;
            }
            QLabel[objectName="sidebar_section_label"] {
                font-weight: bold;
                margin-top: 15px;
                margin-bottom: 8px;
                color: #ffffff;
                border-bottom: 1px solid #444;
                padding-bottom: 4px;
            }
            QLabel#foto_preview_label {
                border: 1px solid #555555;
                background-color: #333333;
                min-width: 100px; min-height: 100px;
                max-width: 100px; max-height: 100px;
                margin-bottom: 10px;
                qproperty-alignment: 'AlignCenter';
                color: #888;
            }
            QTabWidget::pane {
                border: 1px solid #444;
                margin-top: -1px;
            }
            QTabBar::tab {
                background: #333333;
                color: #e0e0e0;
                border: 1px solid #444;
                border-bottom: none;
                padding: 8px 15px;
                margin-right: 2px;
                border-top-left-radius: 5px;
                border-top-right-radius: 5px;
            }
            QTabBar::tab:selected {
                background: #1c1c1c;
                color: #ffffff;
                border-bottom: 1px solid #1c1c1c;
            }
            QTabBar::tab:!selected:hover {
                background: #4a4a4a;
                color: #ffffff;
            }
            QScrollArea {
                border: none;
                background-color: #1c1c1c;
            }
            QGroupBox {
                border: 1px solid #444;
                border-radius: 5px;
                margin-top: 10px;
                padding-top: 10px;
                padding-left: 8px; padding-right: 8px; padding-bottom: 8px;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                subcontrol-position: top left;
                left: 10px;
                padding: 0 3px 0 3px;
                color: #e0e0e0;
            }
            QListWidget { /* Lista de Perfis Dolphin */
                background-color: #2a2a2a; /* Um pouco mais claro que o input */
                border: 1px solid #404040;
                border-radius: 5px;
                color: #d0d0d0;
                padding: 5px;
                alternate-background-color: #303030; /* Para itens alternados, se habilitado */
            }
            """)
        self._toggle_manual_code_input(self.consultar_email_auto_checkbox.isChecked())

    def _toggle_foto_perfil_widgets(self, checked):
        self.selecionar_foto_button.setEnabled(checked)
        if checked:
            self._atualizar_preview_foto(self.caminho_foto_perfil_selecionada)

    def _toggle_bio_widgets(self, checked):
        self.bio_genero_combo.setEnabled(checked)
        self.bio_estado_combo.setEnabled(checked)
        self.bio_atividade_input.setEnabled(checked)
        self.bio_signo_combo.setEnabled(checked)
        self.bio_frase_input.setEnabled(checked)
        self.bio_contato_input.setEnabled(checked)
        self.bio_gerar_auto_checkbox.setEnabled(checked)
        self.bio_preview_button.setEnabled(checked)
        self.bio_text_edit.setEnabled(checked)
        if not checked:
            self.bio_text_edit.clear()

    def _toggle_posts_widgets(self, checked):
        self.selecionar_pasta_fotos_button.setEnabled(checked)
        self.pasta_fotos_path_label.setEnabled(checked)
        self.num_fotos_postar_spinbox.setEnabled(checked)
        self.intervalo_posts_input.setEnabled(checked)
        if not checked:
            self.pasta_fotos_path_label.clear()
            self.caminho_pasta_fotos_posts = None
            self.num_fotos_postar_spinbox.setValue(0)

    def _sincronizar_genero_bio(self, texto_genero_config):
        if hasattr(self, 'bio_genero_combo'):
            index = self.bio_genero_combo.findText(texto_genero_config)
            if index >= 0:
                self.bio_genero_combo.setCurrentIndex(index)

    def _gerar_e_preencher_bio_preview(self):
        if not self.fake and not self.bio_gerar_auto_checkbox.isChecked():
            self.status_text.append("ℹ️ Geração automática de bio não selecionada ou Faker indisponível.")
            return
        partes_bio = []
        genero_bio = self.bio_genero_combo.currentText()
        pronome_atividade = "Apaixonado(a) por"
        if genero_bio == "Masculino": pronome_atividade = "Apaixonado por"
        elif genero_bio == "Feminino": pronome_atividade = "Apaixonada por"
        
        estado_selecionado = self.bio_estado_combo.currentText()
        if estado_selecionado != "Aleatório" and estado_selecionado in self.cidades_por_estado:
            cidade = random.choice(self.cidades_por_estado[estado_selecionado])
            partes_bio.append(f"{cidade}, {estado_selecionado} 🇧🇷")
        elif self.fake:
            try: partes_bio.append(f"{self.fake.city()} 📍")
            except: partes_bio.append("Do Brasil 🇧🇷")
        
        atividade = self.bio_atividade_input.text().strip()
        if not atividade and self.bio_gerar_auto_checkbox.isChecked(): atividade = random.choice(self.hobbies_atividades)
        if atividade: partes_bio.append(f"{pronome_atividade} {atividade}")
        
        signo_selecionado = self.bio_signo_combo.currentText()
        if signo_selecionado != "Aleatório": partes_bio.append(signo_selecionado)
        elif self.bio_gerar_auto_checkbox.isChecked(): partes_bio.append(random.choice(self.signos))
        
        frase = self.bio_frase_input.text().strip()
        if not frase and self.bio_gerar_auto_checkbox.isChecked(): frase = random.choice(self.frases_bio)
        if frase: partes_bio.append(frase)
        
        contato = self.bio_contato_input.text().strip()
        if contato: partes_bio.append(f"Contato: {contato}")
        
        bio_final = " | ".join(filter(None, partes_bio))
        if len(bio_final) > 150:
            # Tenta remover partes para caber, priorizando manter o contato se possível
            if contato and len(bio_final) - len(f" | Contato: {contato}") <= 150 :
                partes_bio = [p for p in partes_bio if p != f"Contato: {contato}"]
            elif frase and len(bio_final) - len(f" | {frase}") <= 150:
                 partes_bio = [p for p in partes_bio if p != frase]
            bio_final = " | ".join(filter(None, partes_bio))[:150]

        self.bio_text_edit.setPlainText(bio_final)
        self.status_text.append("ℹ️ Sugestão de biografia gerada/atualizada.")

    def _toggle_campos_idade(self, index):
        self.data_manual_widget.setVisible(index == 0)
        self.intervalo_idade_widget.setVisible(index == 1)

    def _gerar_e_preencher_nome_usuario_realtime(self):
        if not self.fake:
            self.status_text.append("⚠️ Biblioteca Faker não carregada. Não é possível gerar nomes automaticamente.")
            return
        genero_selecionado_config = self.genero_combo.currentText()
        self._sincronizar_genero_bio(genero_selecionado_config)
        nome_completo, username_gerado = self._gerar_novo_nome_completo_e_usuario(genero_selecionado_config)
        self.manual_fullname_input.setText(nome_completo)
        self.username_input_config.setText(username_gerado)
        self.status_text.append(f"✨ Nome gerado: '{nome_completo}', Usuário sugerido: '{username_gerado}'")
        if self.bio_gerar_auto_checkbox.isChecked():
            self._gerar_e_preencher_bio_preview()

    def _toggle_password_input_enable(self, state):
        is_checked = (state == Qt.Checked)
        self.password_input.setEnabled(is_checked)
        if is_checked:
            # Se marcado, restaura a senha padrão salva (ou string vazia se não houver)
            # e define o placeholder apropriado.
            senha_padrao_salva = self.settings.value("base_password", "") # Usar string vazia como default se não houver nada salvo
            self.password_input.setEchoMode(QLineEdit.Normal) # MOSTRA a senha
            self.password_input.setText(senha_padrao_salva)
            self.password_input.setPlaceholderText("Senha Padrão para todas as contas")
        else:
            # Se desmarcado, limpa o campo e define o placeholder para aleatório.
            self.password_input.setEchoMode(QLineEdit.Password) # Esconde a senha (ou usa Normal se preferir ver o placeholder)
            self.password_input.setText("") # Limpa o texto atual
            self.password_input.setPlaceholderText("Senhas serão geradas aleatoriamente")

    def _toggle_manual_code_input(self, state):
        is_auto = (state == Qt.Checked)
        self.email_user_input.setEnabled(is_auto)
        self.email_senha_input.setEnabled(is_auto)
        if hasattr(self, 'manual_code_widget'):
            self.manual_code_widget.setVisible(not is_auto)
            if is_auto:
                self.manual_code_input.clear()

    def _gerar_senha_aleatoria(self, tamanho=12):
        if tamanho < 8: tamanho = 8
        caracteres = string.ascii_letters + string.digits + "!@#$%^&*()"
        senha = [random.choice(string.ascii_lowercase), random.choice(string.ascii_uppercase),
                 random.choice(string.digits), random.choice("!@#$%^&*()")]
        for _ in range(tamanho - len(senha)):
            senha.append(random.choice(caracteres))
        random.shuffle(senha)
        return "".join(senha)

    def _gerar_novo_nome_completo_e_usuario(self, genero_selecionado, username_base_opcional=""):
        nome_completo = ""
        if not self.fake:
            nome_completo = f"Usuario{random.randint(1000,9999)}Teste"
        else:
            tentativas_nome = 0
            max_tentativas_nome = 50
            while tentativas_nome < max_tentativas_nome:
                if genero_selecionado == "Masculino": nome_completo = self.fake.name_male()
                elif genero_selecionado == "Feminino": nome_completo = self.fake.name_female()
                else: nome_completo = self.fake.name()
                if nome_completo not in self.nomes_usados_nesta_sessao: break
                tentativas_nome += 1
            else:
                nome_completo = f"{nome_completo}_{random.randint(10000,99999)}"
        
        if username_base_opcional:
            username_gerado_base = re.sub(r'[^a-zA-Z0-9._]', '', username_base_opcional.lower())[:20]
        else:
            partes_nome = nome_completo.lower().split()
            user_base = re.sub(r'[^a-z0-9]', '', partes_nome[0]) + (re.sub(r'[^a-z0-9]', '', partes_nome[-1]) if len(partes_nome) > 1 else "")
            username_gerado_base = user_base[:15]
        
        sufixo_letras = ''.join(random.choices(string.ascii_lowercase, k=3))
        username_gerado = f"{username_gerado_base}{sufixo_letras}"
        return nome_completo, username_gerado.lower()

    def _atualizar_preview_foto(self, filePath=None):
        if filePath and os.path.exists(filePath):
            pixmap = QPixmap(filePath)
            if not pixmap.isNull():
                scaled_pixmap = pixmap.scaled(self.foto_preview_label.size(), Qt.KeepAspectRatio, Qt.SmoothTransformation)
                self.foto_preview_label.setPixmap(scaled_pixmap)
                self.foto_preview_label.setText("")
            else:
                self.foto_preview_label.setText("Erro Img")
                self.foto_preview_label.setPixmap(QPixmap())
                self.caminho_foto_perfil_selecionada = None
        else:
            self.foto_preview_label.setText("Sem foto")
            self.foto_preview_label.setPixmap(QPixmap())
            if filePath: self.caminho_foto_perfil_selecionada = None

    def _selecionar_foto_perfil_dialog(self):
        options = QFileDialog.Options()
        filePath, _ = QFileDialog.getOpenFileName(self, "Selecionar Foto de Perfil",
                                                self.settings.value("last_image_dir", os.path.expanduser("~")),
                                                "Arquivos de Imagem (*.png *.jpg *.jpeg);;Todos os Arquivos (*)", options=options)
        if filePath:
            self.caminho_foto_perfil_selecionada = filePath
            self._atualizar_preview_foto(filePath)
            self.settings.setValue("last_image_dir", os.path.dirname(filePath))
            self.status_text.append(f"🖼️ Foto de perfil selecionada: {filePath}")
        else:
            self.status_text.append("ℹ️ Seleção de foto de perfil cancelada.")

    def _selecionar_pasta_fotos_dialog(self):
        folderPath = QFileDialog.getExistingDirectory(self, "Selecionar Pasta com Fotos para Postar",
                                                      self.settings.value("last_posts_folder_dir", os.path.expanduser("~")))
        if folderPath:
            self.caminho_pasta_fotos_posts = folderPath
            self.pasta_fotos_path_label.setText(folderPath)
            self.settings.setValue("last_posts_folder_dir", folderPath)
            self.status_text.append(f"🏞️ Pasta de fotos para posts selecionada: {folderPath}")
        else:
            self.status_text.append("ℹ️ Seleção de pasta de fotos cancelada.")

    def load_settings(self):
        self.emails_list_input.setPlainText(self.settings.value("lista_emails", ""))
        self.email_user_input.setText(self.settings.value("email_user_imap", ""))
        self.email_senha_input.setText(self.settings.value("email_senha_imap", ""))
        self.idade_modo_combo.setCurrentText(self.settings.value("idade_modo", "Definir Data Manualmente"))
        self._toggle_campos_idade(self.idade_modo_combo.currentIndex())
        self.dia_input.setValue(int(self.settings.value("nascimento_dia", 1)))
        self.mes_input.setValue(int(self.settings.value("nascimento_mes", 1)))
        self.ano_input.setValue(int(self.settings.value("nascimento_ano", 2000)))
        self.idade_min_input.setValue(int(self.settings.value("idade_min", 18)))
        self.idade_max_input.setValue(int(self.settings.value("idade_max", 45)))
        self.manual_fullname_input.setText(self.settings.value("manual_fullname", ""))
        self.username_input_config.setText(self.settings.value("base_username_config", ""))
        # self.password_input.setText(self.settings.value("base_password", "")) # Removido, _toggle_password_input_enable cuida disso
        self.quantity_input.setText(self.settings.value("base_quantity", "1"))
        self.senha_padrao_checkbox.setChecked(self.settings.value("usar_senha_padrao", True, type=bool))
        self._toggle_password_input_enable(self.senha_padrao_checkbox.isChecked())
        self.genero_combo.setCurrentText(self.settings.value("genero_selecionado", "Aleatório"))
        self.intervalo_criacao_input.setText(self.settings.value("intervalo_criacao", "60-120")) # Mantido, mas movido conforme seu código
        self.intervalo_email_input.setText(self.settings.value("intervalo_email_check", "10")) # Mantido, mas movido conforme seu código

        foto_path = self.settings.value("caminho_foto_perfil", None)
        self.caminho_foto_perfil_selecionada = foto_path
        self._atualizar_preview_foto(foto_path)
        self.bio_genero_combo.setCurrentText(self.settings.value("bio_genero", "Aleatório"))
        self.bio_estado_combo.setCurrentText(self.settings.value("bio_estado", "Aleatório"))
        self.bio_atividade_input.setText(self.settings.value("bio_atividade", ""))
        self.bio_signo_combo.setCurrentText(self.settings.value("bio_signo", "Aleatório"))
        self.bio_frase_input.setText(self.settings.value("bio_frase", ""))
        self.bio_contato_input.setText(self.settings.value("bio_contato", ""))
        self.bio_gerar_auto_checkbox.setChecked(self.settings.value("bio_gerar_auto", True, type=bool))
        self.bio_text_edit.setPlainText(self.settings.value("bio_texto_final", ""))
        self.caminho_pasta_fotos_posts = self.settings.value("caminho_pasta_posts", None)
        if self.caminho_pasta_fotos_posts and os.path.isdir(self.caminho_pasta_fotos_posts):
            self.pasta_fotos_path_label.setText(self.caminho_pasta_fotos_posts)
        else:
            self.pasta_fotos_path_label.setText("Nenhuma pasta selecionada")
            self.caminho_pasta_fotos_posts = None
        self.num_fotos_postar_spinbox.setValue(self.settings.value("num_fotos_postar", 0, type=int))
        self.intervalo_posts_input.setText(self.settings.value("intervalo_posts", "5"))
        self.consultar_email_auto_checkbox.setChecked(self.settings.value("consultar_email_auto", True, type=bool))
        self._sincronizar_genero_bio(self.genero_combo.currentText()) # Sincroniza após outros combos serem carregados (movido conforme seu código)
        self._toggle_manual_code_input(self.consultar_email_auto_checkbox.isChecked()) # Mantido
        self.ativar_foto_perfil_state = self.settings.value("ativar_foto_perfil", True, type=bool)
        self.toggle_foto_button.setChecked(self.ativar_foto_perfil_state)
        self._update_toggle_button_appearance(self.toggle_foto_button, self.ativar_foto_perfil_state, 'foto')
        self._toggle_foto_perfil_widgets(self.ativar_foto_perfil_state)
        self.ativar_bio_state = self.settings.value("ativar_bio", True, type=bool)
        self.toggle_bio_button.setChecked(self.ativar_bio_state)
        self._update_toggle_button_appearance(self.toggle_bio_button, self.ativar_bio_state, 'bio')
        self._toggle_bio_widgets(self.ativar_bio_state)
        self.ativar_posts_state = self.settings.value("ativar_posts", True, type=bool)
        self.toggle_posts_button.setChecked(self.ativar_posts_state)
        self._update_toggle_button_appearance(self.toggle_posts_button, self.ativar_posts_state, 'posts')
        self.navegador_combo.setCurrentText(self.settings.value("navegador_selecionado", "Chrome"))
        self._toggle_posts_widgets(self.ativar_posts_state)
        self.status_text.append("🔧 Configurações carregadas.")

    def salvar_configuracoes(self):
        self.settings.setValue("lista_emails", self.emails_list_input.toPlainText())
        self.settings.setValue("email_user_imap", self.email_user_input.text())
        self.settings.setValue("email_senha_imap", self.email_senha_input.text())
        self.settings.setValue("idade_modo", self.idade_modo_combo.currentText())
        self.settings.setValue("nascimento_dia", self.dia_input.value())
        self.settings.setValue("nascimento_mes", self.mes_input.value())
        self.settings.setValue("nascimento_ano", self.ano_input.value())
        self.settings.setValue("idade_min", self.idade_min_input.value())
        self.settings.setValue("idade_max", self.idade_max_input.value())
        self.settings.setValue("intervalo_criacao", self.intervalo_criacao_input.text())
        self.settings.setValue("intervalo_email_check", self.intervalo_email_input.text())
        self.settings.setValue("manual_fullname", self.manual_fullname_input.text())
        self.settings.setValue("base_username_config", self.username_input_config.text())
        # self.settings.setValue("base_password", self.password_input.text()) # Removido
        self.settings.setValue("base_quantity", self.quantity_input.text())
        self.settings.setValue("usar_senha_padrao", self.senha_padrao_checkbox.isChecked())
        if self.senha_padrao_checkbox.isChecked():
            self.settings.setValue("base_password", self.password_input.text())
        # else: Não salva/altera "base_password" se o checkbox estiver desmarcado,
        # preservando a senha padrão anteriormente salva.
        self.settings.setValue("genero_selecionado", self.genero_combo.currentText())
        if self.caminho_foto_perfil_selecionada and os.path.exists(self.caminho_foto_perfil_selecionada):
            self.settings.setValue("caminho_foto_perfil", self.caminho_foto_perfil_selecionada)
        else:
            self.settings.remove("caminho_foto_perfil")
        self.settings.setValue("bio_genero", self.bio_genero_combo.currentText())
        self.settings.setValue("bio_estado", self.bio_estado_combo.currentText())
        self.settings.setValue("bio_atividade", self.bio_atividade_input.text())
        self.settings.setValue("bio_signo", self.bio_signo_combo.currentText())
        self.settings.setValue("bio_frase", self.bio_frase_input.text())
        self.settings.setValue("bio_contato", self.bio_contato_input.text())
        self.settings.setValue("bio_gerar_auto", self.bio_gerar_auto_checkbox.isChecked())
        self.settings.setValue("bio_texto_final", self.bio_text_edit.toPlainText())
        if self.caminho_pasta_fotos_posts and os.path.isdir(self.caminho_pasta_fotos_posts):
            self.settings.setValue("caminho_pasta_posts", self.caminho_pasta_fotos_posts)
        else:
            self.settings.remove("caminho_pasta_posts")
        self.settings.setValue("num_fotos_postar", self.num_fotos_postar_spinbox.value())
        self.settings.setValue("intervalo_posts", self.intervalo_posts_input.text())
        self.settings.setValue("consultar_email_auto", self.consultar_email_auto_checkbox.isChecked())
        self.settings.setValue("ativar_foto_perfil", self.ativar_foto_perfil_state)
        self.settings.setValue("ativar_bio", self.ativar_bio_state)
        self.settings.setValue("ativar_posts", self.ativar_posts_state)
        self.settings.setValue("navegador_selecionado", self.navegador_combo.currentText())
        self.status_text.append("💾 Configurações salvas com sucesso!")

    def closeEvent(self, event):
        self.salvar_configuracoes()
        self.parar_todos_workers(silencioso=True)
        self.dolphin_manager.close_all_managed_drivers() # Fecha drivers do Dolphin
        QApplication.processEvents()
        event.accept()

    def parar_todos_workers(self, silencioso=False):
        if not silencioso: self.status_text.append("🛑 PARANDO TODOS OS PROCESSOS...")
        self.criacao_em_andamento = False
        for worker in self.workers_list:
            if worker.isRunning(): worker.stop()
        if not silencioso: self.status_text.append("🛑 Sinal de parada enviado aos workers ativos.")
        self._finalizar_processo_criacao_interface()

    def _gerar_data_nascimento_aleatoria(self):
        idade_min = self.idade_min_input.value()
        idade_max = self.idade_max_input.value()
        if idade_min > idade_max:
            self.status_text.append("⚠️ Idade mínima não pode ser maior que a idade máxima. Usando idade mínima.")
            idade_max = idade_min
        idade_escolhida = random.randint(idade_min, idade_max)
        ano_nascimento = datetime.now().year - idade_escolhida
        mes_nascimento = random.randint(1, 12)
        dia_maximo_mes = calendar.monthrange(ano_nascimento, mes_nascimento)[1]
        dia_nascimento = random.randint(1, dia_maximo_mes)
        self.status_text.append(f"ℹ️ Idade gerada: {idade_escolhida} anos. Data: {dia_nascimento}/{mes_nascimento}/{ano_nascimento}")
        return {"dia": dia_nascimento, "mes": mes_nascimento, "ano": ano_nascimento}

    @pyqtSlot(str)
    def _handle_codigo_manual_necessario(self, username):
        self.status_text.append(f"⏸️ Worker para '{username}' pausado. Insira o código de 6 dígitos e clique em 'Continuar'.")
        self.manual_code_widget.setVisible(True)
        self.manual_code_input.setEnabled(True)
        self.manual_code_input.setFocus()
        self.confirmar_codigo_button.setEnabled(True)
        self.worker_atual_aguardando_codigo = None
        for worker in self.workers_list:
            if hasattr(worker, 'username') and worker.username == username and worker.isRunning():
                self.worker_atual_aguardando_codigo = worker
                break

    def _enviar_codigo_manual(self):
        codigo = self.manual_code_input.text().strip()
        if len(codigo) == 6 and codigo.isdigit():
            if self.worker_atual_aguardando_codigo and self.worker_atual_aguardando_codigo.isRunning():
                self.status_text.append(f"▶️ Enviando código {codigo} para o worker e continuando...")
                self.enviar_codigo_manual_para_worker.emit(codigo)
                self.manual_code_input.setEnabled(False)
                self.confirmar_codigo_button.setEnabled(False)
                self.worker_atual_aguardando_codigo = None
            else:
                self.status_text.append("⚠️ Nenhum processo ativo aguardando código manual ou worker não encontrado.")
                self.manual_code_input.setEnabled(False)
                self.confirmar_codigo_button.setEnabled(False)
        else:
            self.status_text.append("❌ Código manual inválido. Digite 6 dígitos numéricos.")

    def iniciar_processo_criacao_contas(self):
        if self.criacao_em_andamento:
            self.status_text.append("⚠️ Processo de criação já em andamento.")
            return

        emails_texto_completo = self.emails_list_input.toPlainText().strip()
        lista_de_emails_fornecida = [email.strip() for email in emails_texto_completo.splitlines() if email.strip() and "@" in email and "." in email.split("@")[1]]
        if not lista_de_emails_fornecida:
            self.status_text.append("⚠️ Nenhum e-mail válido fornecido na lista de e-mails (aba Configurações).")
            return

        username_base_opcional = self.username_input_config.text().strip()
        senha_a_usar_padrao = ""
        if self.senha_padrao_checkbox.isChecked():
            senha_a_usar_padrao = self.password_input.text()
            if not senha_a_usar_padrao:
                self.status_text.append("⚠️ 'Usar Senha Padrão' está marcado, mas nenhuma senha foi definida.")
                return

        consultar_auto = self.consultar_email_auto_checkbox.isChecked()
        if consultar_auto and not all([self.email_user_input.text(), self.email_senha_input.text()]):
            self.status_text.append("⚠️ Consulta automática de e-mail ativa, mas as credenciais IMAP não foram preenchidas (aba Configurações).")
            return

        if username_base_opcional and not re.match(r"^[a-zA-Z0-9._]+$", username_base_opcional):
            self.status_text.append("⚠️ Usuário Base (se preenchido) deve conter apenas letras, números, pontos ou underscores.")
            return

        quantity_str = self.quantity_input.text()
        if not quantity_str.isdigit() or int(quantity_str) <= 0:
            self.status_text.append("⚠️ Quantidade de contas inválida.")
            return
        quantity = int(quantity_str)

        if len(lista_de_emails_fornecida) < quantity:
            self.status_text.append(f"⚠️ Quantidade de e-mails na lista ({len(lista_de_emails_fornecida)}) é menor que a quantidade de contas a criar ({quantity}).")
            return

        codigo_manual_texto = self.manual_code_input.text().strip()
        if not consultar_auto and quantity > 1:
            self.status_text.append("⚠️ Modo de código manual só funciona para criar 1 conta por vez. Mude a quantidade para 1.")
            return
        if not consultar_auto and codigo_manual_texto:
            self.status_text.append("ℹ️ Código manual já preenchido. O bot pausará para confirmação.")

        try:
            intervalo_str_parts = self.intervalo_criacao_input.text().split('-')
            if len(intervalo_str_parts) == 1:
                self.intervalo_entre_criacoes_min = max(10, int(intervalo_str_parts[0].strip()))
                self.intervalo_entre_criacoes_max = self.intervalo_entre_criacoes_min
            elif len(intervalo_str_parts) == 2:
                self.intervalo_entre_criacoes_min = max(10, int(intervalo_str_parts[0].strip()))
                self.intervalo_entre_criacoes_max = max(self.intervalo_entre_criacoes_min, int(intervalo_str_parts[1].strip()))
            else: raise ValueError("Formato inválido")
        except ValueError:
            self.status_text.append("⚠️ Intervalo de criação inválido. Use X ou X-Y (ex: 60 ou 60-120). Mínimo 10s.")
            return

        try:
            self.intervalo_email_check_val = int(self.intervalo_email_input.text().strip())
            if self.intervalo_email_check_val <= 0: raise ValueError("Deve ser positivo")
        except ValueError:
            self.status_text.append("⚠️ Intervalo para buscar e-mail deve ser numérico e positivo.")
            return

        if self.ativar_foto_perfil_state and self.caminho_foto_perfil_selecionada and not os.path.exists(self.caminho_foto_perfil_selecionada):
            self.status_text.append(f"❌ Erro: Arquivo da foto de perfil não encontrado em '{self.caminho_foto_perfil_selecionada}'.")
            self._atualizar_preview_foto(None)
            return

        if not self.fake and not self.manual_fullname_input.text().strip() and self.genero_combo.currentText() != "Manual":
            self.status_text.append("⚠️ Faker não disponível e nome manual não fornecido.")
            return

        self.status_text.clear()
        self.contas_a_criar_lista = []
        self.indice_conta_atual = 0
        self.criacao_em_andamento = True
        self.workers_list.clear()
        self.nomes_usados_nesta_sessao.clear()
        self.start_button.setEnabled(False)
        self.stop_button.setEnabled(True)
        self.manual_code_input.setEnabled(False)
        self.confirmar_codigo_button.setEnabled(False)
        self.salvar_configuracoes()

        self.status_text.append(f"✨ Preparando para criar {quantity} conta(s)...")
        genero_selecionado_para_nomes = self.genero_combo.currentText()
        modo_idade_selecionado = self.idade_modo_combo.currentText()
        texto_bio_final_para_worker = self.bio_text_edit.toPlainText().strip()
        if self.ativar_bio_state and self.bio_gerar_auto_checkbox.isChecked() and not texto_bio_final_para_worker:
            self._gerar_e_preencher_bio_preview()
            texto_bio_final_para_worker = self.bio_text_edit.toPlainText().strip()
            if not texto_bio_final_para_worker:
                 self.status_text.append("⚠️ Tentativa de gerar bio automaticamente falhou ou resultou em bio vazia.")

        config_bio_para_worker = {
            'texto_bio_final': texto_bio_final_para_worker
        }
        try:
            intervalo_posts_val = int(self.intervalo_posts_input.text().strip())
            if intervalo_posts_val < 1 : intervalo_posts_val = 1
        except ValueError:
            intervalo_posts_val = 5
            self.status_text.append("⚠️ Intervalo entre posts inválido, usando padrão de 5s.")
            self.intervalo_posts_input.setText("5")
        config_posts_para_worker = {
            'caminho_pasta_fotos': self.caminho_pasta_fotos_posts,
            'num_fotos_a_postar': self.num_fotos_postar_spinbox.value(),
            'intervalo_entre_posts': intervalo_posts_val
        }

        for i in range(quantity):
            current_email_conta = lista_de_emails_fornecida[i]
            nome_completo_manual = self.manual_fullname_input.text().strip()
            if nome_completo_manual and (i == 0 or quantity == 1):
                current_nome_completo = nome_completo_manual
                if username_base_opcional:
                    current_username_base = re.sub(r'[^a-zA-Z0-9._]', '', username_base_opcional.lower())
                    sufixo_letras_username = ''.join(random.choices(string.ascii_lowercase, k=3))
                    current_username = (current_username_base[:20] + sufixo_letras_username) if quantity > 1 else current_username_base
                else:
                    partes_nome_manual = current_nome_completo.lower().split()
                    user_base_manual = re.sub(r'[^a-z0-9]', '', partes_nome_manual[0]) + (re.sub(r'[^a-z0-9]', '', partes_nome_manual[-1]) if len(partes_nome_manual) > 1 else "")
                    sufixo_letras_username = ''.join(random.choices(string.ascii_lowercase, k=3))
                    current_username = user_base_manual[:15] + sufixo_letras_username
            else:
                username_base_para_geracao = username_base_opcional if i == 0 and username_base_opcional else ""
                current_nome_completo, current_username = self._gerar_novo_nome_completo_e_usuario(genero_selecionado_para_nomes, username_base_para_geracao)
                self.nomes_usados_nesta_sessao.add(current_nome_completo)
            
            final_password_para_conta = senha_a_usar_padrao if self.senha_padrao_checkbox.isChecked() else self._gerar_senha_aleatoria()
            if modo_idade_selecionado == "Definir Data Manualmente":
                data_nascimento_para_conta = {"dia": self.dia_input.value(), "mes": self.mes_input.value(), "ano": self.ano_input.value()}
            else:
                data_nascimento_para_conta = self._gerar_data_nascimento_aleatoria()

            # Obter o user_data_dir do DolphinAntyManager para este worker
            user_data_dir_para_worker = os.path.join(self.dolphin_manager.optimized_sessions_dir, current_username.lower())

            dados_conta = {
                "email": current_email_conta, "username": current_username.lower(),
                "password": final_password_para_conta, "nome_completo": current_nome_completo,
                "data_nascimento": data_nascimento_para_conta, "intervalo_email": self.intervalo_email_check_val,
                "ativar_foto_perfil": self.ativar_foto_perfil_state, "caminho_foto": self.caminho_foto_perfil_selecionada,
                "ativar_bio": self.ativar_bio_state, "config_bio": config_bio_para_worker, "user_data_dir": user_data_dir_para_worker,
                "ativar_posts": self.ativar_posts_state, "config_posts": config_posts_para_worker,
                "consultar_email_auto": consultar_auto, "codigo_manual": codigo_manual_texto if not consultar_auto else ""
                , "navegador_escolhido": self.navegador_combo.currentText() # Adiciona o navegador escolhido
            }
            self.contas_a_criar_lista.append(dados_conta)
        self._iniciar_proxima_conta_worker()

    def _iniciar_proxima_conta_worker(self):
        if not self.criacao_em_andamento or self.indice_conta_atual >= len(self.contas_a_criar_lista):
            self._finalizar_processo_criacao_interface()
            if self.criacao_em_andamento: self.status_text.append("\n✅🏁 Todas as contas foram processadas.")
            self.criacao_em_andamento = False
            return

        dados_conta_atual = self.contas_a_criar_lista[self.indice_conta_atual]
        self.status_text.append(f"\n--- Iniciando conta {self.indice_conta_atual + 1}/{len(self.contas_a_criar_lista)}: {dados_conta_atual['username']} ---")
        self.status_text.append(f" E-mail: {dados_conta_atual['email']}")
        self.status_text.append(f" 🧑 Nome: {dados_conta_atual['nome_completo']}")
        self.status_text.append(f" 🔑 Senha: {'*' * len(dados_conta_atual['password'])}")
        self.status_text.append(f" 🎂 Data Nasc: {dados_conta_atual['data_nascimento']['dia']}/{dados_conta_atual['data_nascimento']['mes']}/{dados_conta_atual['data_nascimento']['ano']}")
        if dados_conta_atual.get('ativar_foto_perfil') and dados_conta_atual.get('caminho_foto'):
            self.status_text.append(f" 🖼️ Foto de perfil: Ativada ({os.path.basename(dados_conta_atual['caminho_foto'])})")
        if dados_conta_atual.get('ativar_bio') and dados_conta_atual.get('config_bio',{}).get('texto_bio_final'):
            self.status_text.append(f" 📝 Bio: Ativada ({dados_conta_atual['config_bio']['texto_bio_final'][:50]}...)")
        if dados_conta_atual.get('ativar_posts') and dados_conta_atual.get('config_posts', {}).get('caminho_pasta_fotos') and dados_conta_atual.get('config_posts', {}).get('num_fotos_a_postar', 0) > 0:
            self.status_text.append(f" 🏞️ Postagens: Ativadas ({dados_conta_atual['config_posts']['num_fotos_a_postar']} foto(s) de {os.path.basename(dados_conta_atual['config_posts']['caminho_pasta_fotos'])})")
        self.status_text.append(f" 📧 Modo Código: {'Automático' if dados_conta_atual.get('consultar_email_auto', True) else 'Manual'}")

        self.nome_atual_para_worker = dados_conta_atual['nome_completo']
        worker = Worker(
            dados_conta_completa=dados_conta_atual,
            parent_interface=self,
            dolphin_manager=self.dolphin_manager # Passa a instância do DolphinAntyManager
        )
        worker.codigo_manual_necessario.connect(self._handle_codigo_manual_necessario)
        self.enviar_codigo_manual_para_worker.connect(worker.resume)
        worker.finished.connect(self._worker_finalizado)
        worker.status.connect(self.status_text.append)
        self.workers_list.append(worker)
        worker.start()

    def _worker_finalizado(self, mensagem_final):
        """
        Slot chamado quando um worker de criação de conta finaliza.
        Limpa a UI, atualiza o estado e inicia o próximo worker, se houver.
        """
        # Limpa e oculta os widgets de código manual, pois o worker terminou.
        self.manual_code_input.clear()
        self.manual_code_widget.setVisible(False)
        self.confirmar_codigo_button.setEnabled(False)
        self.worker_atual_aguardando_codigo = None

        # O sinal 'status' do worker já exibe a mensagem final.
        # Apenas adicionamos contexto se a conta foi criada com sucesso para atualizar a lista de perfis.
        if "✅ Conta" in mensagem_final or "adicionados ao Dolphin Anty Manager" in mensagem_final:
            self.status_text.append(f"ℹ️ Sucesso detectado. Atualizando lista de perfis do Dolphin...")
            self._populate_profiles_list()

        # Remove o worker que acabou de finalizar da lista de workers ativos.
        sender_worker = self.sender()
        if sender_worker in self.workers_list:
            self.workers_list.remove(sender_worker)

        # Incrementa o índice para apontar para a próxima conta.
        self.indice_conta_atual += 1

        # Verifica se ainda há contas na fila para processar.
        if self.criacao_em_andamento and self.indice_conta_atual < len(self.contas_a_criar_lista):
            intervalo_ms = random.randint(self.intervalo_entre_criacoes_min * 1000, self.intervalo_entre_criacoes_max * 1000)
            self.status_text.append(f"\n⏳ Aguardando {intervalo_ms / 1000:.0f} segundos antes de iniciar a próxima conta...")
            
            # Usa um QTimer para chamar o próximo worker após o intervalo, garantindo que a UI não trave.
            QTimer.singleShot(intervalo_ms, self._iniciar_proxima_conta_worker)
        else:
            # Se não houver mais contas, finaliza o processo de criação.
            if self.criacao_em_andamento:
                self.status_text.append("\n✅🏁 Todas as contas foram processadas.")
            self._finalizar_processo_criacao_interface()
            self.criacao_em_andamento = False

    def _finalizar_processo_criacao_interface(self):
        self.start_button.setEnabled(True)
        self.stop_button.setEnabled(False)
        self.manual_code_widget.setVisible(False)
        self.manual_code_input.setEnabled(False)
        self.confirmar_codigo_button.setEnabled(False)

    def _launch_selected_profile(self, item):
        """Inicia uma worker para abrir o perfil no navegador (clique duplo)."""
        if not item:
            self.status_text.append("🐬 Nenhum perfil selecionado para abrir.")
            return
        username = item.data(Qt.UserRole)
        if username:
            if username in self.dolphin_action_workers and self.dolphin_action_workers[username].isRunning():
                self.status_text.append(f"🐬 Ação para '{username}' já em progresso. Aguarde.")
                return

            self.status_text.append(f"🐬 Tentando abrir o perfil '{username}' (clique duplo)...")
            worker = DolphinActionWorker(self.dolphin_manager, username, "launch_only", parent=self)
            worker.action_completed.connect(self._on_dolphin_action_completed)
            worker.status_update.connect(self.status_text.append)
            self.dolphin_action_workers[username] = worker
            worker.start()
            # A UI será atualizada pelo _on_dolphin_action_completed
        else:
            self.status_text.append("🐬 Item selecionado não contém um nome de usuário válido.")

    def _populate_profiles_list(self):
        if not hasattr(self, 'profiles_list_widget'):
            return
        
        # Salva a posição do scroll antes de limpar
        scrollbar = self.profiles_list_widget.verticalScrollBar()
        scroll_position = scrollbar.value()

        self.profiles_list_widget.clear()
        if hasattr(self, 'profile_buttons'):
            for button in self.profile_buttons.values():
                if isinstance(button, QPushButton) and not button.isDestroyed():
                    button.deleteLater()
        self.profile_buttons = {}
        all_profiles_metadata = self.dolphin_manager.get_all_profiles_metadata()

        # --- NOVO: Validar status real dos perfis conectados ---
        for username, metadata in all_profiles_metadata.items():
            # Obtém o status do bot e da conta
            bot_status = metadata.get('bot_login_status', 'desconectado')
            account_status = metadata.get('account_status', None)
            last_error = metadata.get('last_error', '')
            
            # Prepara o texto do item
            status_icons = {
                'conta_suspensa': '🔴',
                'conta_desativada': '🟣',
                'conta_bloqueada': '🟡',
                'requer_verificacao': '🔵'
            }
            
            # Cria o texto do item com o status da conta
            item_text = f"{username}"
            if account_status:
                status_icon = status_icons.get(account_status, '⚠️')
                item_text += f" {status_icon}"
            
            # Cria um item na lista
            item = QListWidgetItem(item_text)
            
            # Armazena o nome de usuário como dado de usuário para uso posterior
            item.setData(Qt.UserRole, username)
            
            # Define tooltip baseado no status
            tooltip_text = f"Perfil '{username}'"
            if account_status:
                status_text = {
                    'conta_suspensa': 'Conta Suspensa',
                    'conta_desativada': 'Conta Desativada',
                    'conta_bloqueada': 'Conta Bloqueada',
                    'requer_verificacao': 'Requer Verificação'
                }.get(account_status, account_status)
                tooltip_text += f"\nStatus: {status_text}"
            
            if bot_status == "conectado":
                tooltip_text += "\nBOT: Conectado"
            elif bot_status == "logando":
                tooltip_text += "\nBOT: Login em andamento"
            elif bot_status in ["erro_login", "erro_ao_abrir"]:
                tooltip_text += f"\nBOT: Erro - {last_error}"
            else:
                tooltip_text += "\nBOT: Desconectado"
            
            item.setToolTip(tooltip_text)
            
            # Define a cor do texto baseado no status da conta
            if account_status:
                if 'suspensa' in account_status:
                    item.setForeground(QColor(255, 0, 0))  # Vermelho
                elif 'bloqueada' in account_status:
                    item.setForeground(QColor(255, 165, 0))  # Laranja
                elif 'desativada' in account_status:
                    item.setForeground(QColor(128, 0, 128))  # Roxo
                elif 'verificacao' in account_status:
                    item.setForeground(QColor(0, 0, 255))  # Azul
            
            # Adiciona o item à lista
            self.profiles_list_widget.addItem(item)
        
        # Restaura posição de scroll se possível
        scrollbar.setValue(scroll_position)
        
        # Conecta os sinais de seleção para o item (garante que funcione com clique e setas do teclado)
        try:
            self.profiles_list_widget.itemClicked.disconnect()
            self.profiles_list_widget.currentItemChanged.disconnect()
        except:
            pass  # Se não estiver conectado, não há problema
        
        # Conecta o evento de clique e também o evento de mudança de seleção
        self.profiles_list_widget.itemClicked.connect(self._perfil_selecionado)
        self.profiles_list_widget.currentItemChanged.connect(lambda current, previous: self._perfil_selecionado())
        
        # Atualiza também o botão central na janela principal
        self._atualizar_botao_entrar_perfil()
        
        if not all_profiles_metadata:
            # Exibe um item estático dizendo que não há perfis
            item = QListWidgetItem("🐬 Não há perfis cadastrados")
            item.setFlags(Qt.NoItemFlags) # Não selecionável
            self.profiles_list_widget.addItem(item)
            self.status_text.append("🐬 Nenhum perfil Dolphin Anty salvo encontrado.")

    def _monitorar_drivers_conectados(self):
        """Verifica quais drivers estão conectados e atualiza a interface."""
        # Lista de perfis com drivers ativos
        perfis_ativos = []
        
        # Obter todos os drivers ativos
        if hasattr(self, 'dolphin_manager') and self.dolphin_manager:
            perfis_ativos = [nome for nome, driver in self.dolphin_manager.profile_drivers.items() if driver]
        
        # Atualizar botões de perfis
        for username, button in self.profile_buttons.items():
            if username in perfis_ativos:
                # Perfil tem driver ativo
                button.setStyleSheet("background-color: #e6ffee; border: 1px solid #99ffcc;")
            else:
                # Perfil sem driver ativo
                self._update_profile_button_text(username, button)
        
        # Atualizar os contadores de estatísticas
        self._atualizar_contadores_status()
    
    def _resetar_estatisticas(self):
        """Limpa os contadores de estatísticas e reinicia o monitoramento."""
        try:
            # Mensagem direta sem confirmação para simplificar e testar
            self.status_text.append("🔄 Resetando contadores de estatísticas...")
            
            # Zerar contadores na interface imediatamente
            self.perfis_ativos_count.setText("0")
            self.perfis_conectados_count.setText("0")
            self.perfis_erro_count.setText("0")
            self.perfis_total_count.setText("0")
            
            # Forçar atualização imediata
            self._atualizar_contadores_status()
            
            # Confirmar conclusão
            self.status_text.append("✅ Contadores de estatísticas foram resetados com sucesso.")
        except Exception as e:
            self.status_text.append(f"❌ Erro ao resetar estatísticas: {str(e)}")
            print(f"[DEBUG] Erro em _resetar_estatisticas: {e}")
    
    def _atualizar_contadores_status(self):
        """Atualiza os contadores de perfis na interface com base nos metadados."""
        # Contador para cada categoria
        perfis_ativos = 0
        perfis_conectados = 0
        perfis_erro = 0
        total_perfis = 0
        
        # Obter todos os metadados
        if hasattr(self, 'dolphin_manager') and self.dolphin_manager:
            all_metadata = self.dolphin_manager.get_all_profiles_metadata()
            total_perfis = len(all_metadata)
            
            # Contar por status
            for username, metadata in all_metadata.items():
                if isinstance(metadata, dict):
                    status = metadata.get('bot_login_status', '').lower()
                    if status == 'ativo':
                        perfis_ativos += 1
                    elif status == 'conectado':
                        perfis_conectados += 1
                    elif 'erro' in status or 'falha' in status or 'incorreta' in status:
                        perfis_erro += 1
        
        # Atualizar contadores na interface
        self.perfis_ativos_count.setText(str(perfis_ativos))
        self.perfis_conectados_count.setText(str(perfis_conectados))
        self.perfis_erro_count.setText(str(perfis_erro))
        self.perfis_total_count.setText(str(total_perfis))

    def _update_profile_button_text(self, username, button_instance=None):
        """Atualiza o texto, o tooltip e o estilo de um botão de perfil específico."""
        button = button_instance if button_instance else self.profile_buttons.get(username)
        if not button:
            return

        metadata = self.dolphin_manager.get_profile_metadata(username)
        if not metadata:
            button.setText("Erro Meta")
            button.setToolTip("Metadados não encontrados.")
            button.setEnabled(False)
            button.setStyleSheet("background-color: #757575;") # Cinza escuro
            return

        bot_login_status = metadata.get('bot_login_status', 'desconectado')
        account_status = metadata.get('account_status', None)
        last_error = metadata.get('last_error')
        print(f"[DEBUG] GUI _update_profile_button_text: Atualizando botão para '{username}', status lido='{bot_login_status}', erro='{last_error}'") # DEBUG
        button.setEnabled(True)
        
        # Prepara o texto do botão com o status da conta
        button_text = ""
        tooltip_text = f"Perfil '{username}'"
        button_color = ""
        
        # Define o status da conta primeiro
        if account_status:
            status_text = {
                'conta_suspensa': '🔴 Conta Suspensa',
                'conta_desativada': '🟣 Conta Desativada',
                'conta_bloqueada': '🟡 Conta Bloqueada',
                'requer_verificacao': '🔵 Requer Verificação'
            }.get(account_status, account_status)
            button_text = status_text
            tooltip_text += f"\nStatus: {status_text}"
            
            # Define a cor do botão baseado no status da conta
            if 'suspensa' in account_status:
                button_color = "#FF0000"  # Vermelho
            elif 'bloqueada' in account_status:
                button_color = "#FFA500"  # Laranja
            elif 'desativada' in account_status:
                button_color = "#800080"  # Roxo
            elif 'verificacao' in account_status:
                button_color = "#0000FF"  # Azul
        
        # Adiciona o status do bot
        if bot_login_status == "conectado":
            button_text = f"Conectado 🟢" + (f" - {button_text}" if button_text else "")
            tooltip_text += "\nBOT: Conectado. Clique para FECHAR O NAVEGADOR (mantém logado)."
            if not button_color:
                button_color = "#4CAF50"  # Verde para conectado
        elif bot_login_status == "logando":
            button_text = "Logando..." + (f" - {button_text}" if button_text else "")
            tooltip_text += "\nBOT: Tentando fazer login"
            if not button_color:
                button_color = "#FFA726"  # Laranja para logando
        elif bot_login_status in ["erro_login", "erro_ao_abrir"]:
            button_text = "Erro ❌" + (f" - {button_text}" if button_text else "")
            tooltip_text += f"\nBOT: Erro - {last_error}"
            if not button_color:
                button_color = "#f44336"  # Vermelho para erro
        else:
            button_text = "Desconectado" + (f" - {button_text}" if button_text else "")
            tooltip_text += "\nBOT: Desconectado. Clique para ABRIR O NAVEGADOR."
            if not button_color:
                button_color = "#757575"  # Cinza para desconectado
        
        # Atualiza o botão
        button.setText(button_text)
        button.setToolTip(tooltip_text)
        button.setStyleSheet(f"background-color: {button_color}; color: white;")
    def _cadastrar_conta_manual_dolphin(self):
        username = self.manual_profile_user_input.text().strip()
        password = self.manual_profile_pass_input.text().strip()

        if not username or not password:
            self.status_text.append(" Por favor, preencha o usuário e a senha para cadastrar manualmente.")
            return

        # O DolphinAntyManager já define o bot_login_status como 'desconectado' por padrão.
        try:
            self.dolphin_manager.add_profile_metadata(username, username, password, "Chrome") # Usando username como email
            self.status_text.append(f" Conta manual '{username}' registrada no Dolphin Anty com navegador Chrome.")
            self._populate_profiles_list() # Atualiza a lista de perfis
            self.manual_profile_user_input.clear()
            self.manual_profile_pass_input.clear()
        except Exception as e:
            self.status_text.append(f" Erro ao registrar conta manual '{username}': {e}")
        
# Método para importar usuários e senhas de arquivo TXT
    def _importar_usuarios_txt(self):
        options = QFileDialog.Options()
        filePath, _ = QFileDialog.getOpenFileName(self, "Selecionar arquivo TXT com usuários",
                                               self.settings.value("last_txt_dir", os.path.expanduser("~")),
                                               "Arquivos de Texto (*.txt);;Todos os Arquivos (*)", options=options)
        if not filePath:
            self.status_text.append(" Importação de usuários cancelada.")
            return
            
        # Pergunta ao usuário qual o formato do arquivo
        msgBox = QMessageBox(self)
        msgBox.setWindowTitle("Formato do Arquivo")
        msgBox.setText("Qual o formato do arquivo de usuários?\n\n" +
                     "1. Se for 'usuario,senha' ou 'usuario:senha', escolha 'Formato Padrão'\n" +
                     "2. Se for outro formato sem separador claro, escolha 'Formato Especial'")
        
        # Adiciona botões personalizados
        btnPadrao = msgBox.addButton("Formato Padrão", QMessageBox.ActionRole)
        btnEspecial = msgBox.addButton("Formato Especial", QMessageBox.ActionRole)
        msgBox.setDefaultButton(btnPadrao)  # Botão padrão selecionado
        
        # Exibe a mensagem e espera a resposta
        msgBox.exec_()
        
        # Verifica qual botão foi clicado
        formato_especial = (msgBox.clickedButton() == btnEspecial)
        
        try:
            # Abrir com codificação utf-8, mas se falhar, tentar outras codificações
            try:
                with open(filePath, 'r', encoding='utf-8') as file:
                    conteudo = file.read().strip()
            except UnicodeDecodeError:
                try:
                    with open(filePath, 'r', encoding='latin-1') as file:
                        conteudo = file.read().strip()
                except UnicodeDecodeError:
                    with open(filePath, 'r', encoding='iso-8859-1') as file:
                        conteudo = file.read().strip()
        
            self.settings.setValue("last_txt_dir", os.path.dirname(filePath))
            contador_adicionados = 0
            contador_erros = 0
            
            # Exibir informações sobre o arquivo
            self.status_text.append(f"\n📂 Importando arquivo: {os.path.basename(filePath)}")
            
            # Exibir as primeiras 5 linhas do arquivo como exemplo
            primeiras_linhas = conteudo.splitlines()[:5]
            if primeiras_linhas:
                self.status_text.append("\n📙 Amostra das primeiras linhas:")
                for i, linha in enumerate(primeiras_linhas, 1):
                    self.status_text.append(f"  Linha {i}: {linha[:50]}{'...' if len(linha) > 50 else ''}")
        
            # Separa as linhas do arquivo
            linhas = [linha.strip() for linha in conteudo.splitlines() if linha.strip()]
            total_linhas = len(linhas)
            self.status_text.append(f"\n📊 Total de {total_linhas} linha(s) encontrada(s) no arquivo.")
            
            # Se for formato especial, pergunta ao usuário onde está a divisão
            exemplo_senha = ""
            if formato_especial and linhas:
                exemplo = linhas[0][:min(40, len(linhas[0]))]
                self.status_text.append(f"\nℹ️ Exemplo da primeira linha: '{exemplo}'")
                
                # Verifica se o exemplo contém letras e depois números (formato comum)
                import re
                letras_seguidas_por_numeros = re.search(r'([a-zA-Z.]+)([0-9]+)', exemplo)
                if letras_seguidas_por_numeros:
                    pos_divisao = letras_seguidas_por_numeros.start(2)  # Posição do primeiro dígito
                    self.status_text.append(f"\n✅ Formato detectado automaticamente: usuário termina em posição {pos_divisao}")
                    exemplo_usuario = exemplo[:pos_divisao]
                    exemplo_senha = exemplo[pos_divisao:]
                    self.status_text.append(f"  👤 Exemplo usuário: '{exemplo_usuario}'")
                    self.status_text.append(f"  🔑 Exemplo senha: '{exemplo_senha}'")
                else:
                    # Tenta adivinhar dividindo a linha pelo meio
                    pos_divisao = len(exemplo) // 2
                    self.status_text.append(f"\n❓ Formato não detectado automaticamente. Dividindo no meio.")
                
                # Pergunta ao usuário se a detecção automática está correta
                if letras_seguidas_por_numeros:
                    # Cria caixa de mensagem de confirmação
                    confirmMsgBox = QMessageBox(self)
                    confirmMsgBox.setWindowTitle("Confirmação de Formato")
                    confirmMsgBox.setText(f"Detectei que o usuário termina onde começam os números.\n\n" +
                        f"Exemplo:\n" +
                        f"Linha completa: '{exemplo}'\n" +
                        f"Usuário: '{exemplo_usuario}'\n" +
                        f"Senha: '{exemplo_senha}'\n\n" +
                        f"Esta divisão está correta?")
                    
                    # Adiciona botões Sim e Não
                    btnSim = confirmMsgBox.addButton("Sim", QMessageBox.YesRole)
                    btnNao = confirmMsgBox.addButton("Não", QMessageBox.NoRole)
                    confirmMsgBox.setDefaultButton(btnSim)
                    
                    # Exibe a mensagem e aguarda resposta
                    confirmMsgBox.exec_()
                    
                    # Verifica qual botão foi clicado
                    usa_deteccao_automatica = (confirmMsgBox.clickedButton() == btnSim)
                else:
                    # Se não foi possível detectar, pede ao usuário para informar o tamanho do username
                    from PyQt5.QtWidgets import QInputDialog
                    tamanho_username, ok = QInputDialog.getInt(
                        self, "Tamanho do Usuário", 
                        f"Informe quantos caracteres tem o usuário:\n\nExemplo: '{exemplo}'", 
                        pos_divisao, 1, len(exemplo), 1
                    )
                    if ok:
                        pos_divisao = tamanho_username
                        self.status_text.append(f"  ℹ️ Usará divisão manual: {pos_divisao} caracteres para o usuário")
                    else:
                        self.status_text.append("  ❌ Operação cancelada pelo usuário.")
                        return
                    usa_deteccao_automatica = False
            
            # Processa cada linha do arquivo
            for linha in linhas:
                # Debug: mostrar a linha atual que está sendo processada
                self.status_text.append(f"\n🔍 Processando: '{linha}'")
                
                # Tenta vários métodos para extrair usuário e senha
                username = None
                password = None
                
                # Se for formato especial, usa o método escolhido pelo usuário
                if formato_especial:
                    # Tenta reconhecer o formato específico do usuário (agbrielvisul,s96552654)
                    match_especial = re.search(r'([a-zA-Z0-9._]+)[,\s]*([a-zA-Z0-9._]+)', linha)
                    if match_especial:
                        username = match_especial.group(1)
                        password = match_especial.group(2)
                        self.status_text.append(f"  ✔️ Formato especial detectado: '{username}' e '{password}'")
                    elif usa_deteccao_automatica and re.search(r'([a-zA-Z.]+)([0-9]+)', linha):
                        # Detecta automaticamente onde terminam as letras e começam os números
                        match = re.search(r'([a-zA-Z.]+)([0-9]+)', linha)
                        username = match.group(1)
                        password = match.group(2)
                        self.status_text.append(f"  ✔️ Formato especial detectado automaticamente")
                    else:
                        # Usa a posição fixa informada pelo usuário
                        if len(linha) > pos_divisao:
                            username = linha[:pos_divisao].strip()
                            password = linha[pos_divisao:].strip()
                            self.status_text.append(f"  ✔️ Formato especial usando divisão na posição {pos_divisao}")
                        else:
                            self.status_text.append(f"  ❌ Linha muito curta para divisão na posição {pos_divisao}")
                            contador_erros += 1
                            continue
                # Método 1: Verifica separadores comuns
                elif ',' in linha:
                    partes = linha.split(',', 1)
                    self.status_text.append(f"  ✔️ Separador vírgula encontrado, partes: {len(partes)}")
                    if len(partes) == 2:
                        username, password = [parte.strip() for parte in partes]
                elif ':' in linha:
                    partes = linha.split(':', 1)
                    self.status_text.append(f"  ✔️ Separador dois-pontos encontrado, partes: {len(partes)}")
                    if len(partes) == 2:
                        username, password = [parte.strip() for parte in partes]
                # Método 2: Procura por padrões comuns usando expressões regulares
                elif ' ' in linha:  # Tenta dividir por espaços
                    partes = linha.split()
                    self.status_text.append(f"  ✔️ Separador espaço encontrado, partes: {len(partes)}")
                    if len(partes) == 2:  # Exatamente duas partes
                        username, password = partes
                    elif len(partes) > 2:  # Mais de duas partes - tenta adivinhar
                        # Assume que a primeira parte é o usuário e a última é a senha
                        username = partes[0]
                        password = partes[-1]
                        self.status_text.append(f"  ℹ️ Múltiplas partes encontradas. Usando primeira como usuário e última como senha.")
                # Método 3: Verifica se há caracteres especiais que poderiam separar o usuário e senha
                else:
                    # Procuramos por última ocorrência de letras seguidas por números/caracteres especiais
                    import re
                    # Procura padrões comuns em nomes de usuário (letras/números) seguidos por senha
                    match = re.search(r'([a-zA-Z0-9._]+)\s*([a-zA-Z0-9._!@#$%^&*(){}\[\]~]+)$', linha)
                    if match:
                        username, password = match.groups()
                        self.status_text.append(f"  ✔️ Extraiu usuário e senha usando análise de padrões.")
                    # Procura por um bloco de texto seguido por números ou caracteres especiais
                    else:
                        # Tenta dividir a linha no meio se for relativamente curta
                        if len(linha) < 40:  # Tamanho razoável para username+senha
                            # Divide aproximadamente no meio, favorecendo o username mais curto
                            meio = len(linha) // 3
                            username = linha[:meio].strip()
                            password = linha[meio:].strip()
                            self.status_text.append(f"  ℹ️ Sem separador claro. Dividindo a linha: '{username}' | '{password}'")
                        else:
                            self.status_text.append(f"  ❌ Formato inválido: Nenhum padrão reconhecido em: '{linha}'")
                            contador_erros += 1
                            continue
                
                # Verificação final se temos username e password válidos
                if not username or not password or len(username) < 3 or len(password) < 3:
                    self.status_text.append(f"  ❌ Usuário ou senha inválidos após extração: User: '{username}' / Senha: '{password if password else 'N/A'}'")
                    contador_erros += 1
                    continue
                
                self.status_text.append(f"  👤 Usuário: '{username}', 🔑 Senha: '{password[:3]}****'")
                
                if not username or not password:
                    self.status_text.append(f"  ❌ Usuário ou senha vazios após separar.")
                    contador_erros += 1
                    continue
                
                try:
                    # Usa o username como email se não houver @ no username
                    email = username
                    if '@' not in username:
                        # Adiciona um domínio de email padrão se não for um email
                        email = f"{username}@gmail.com"
                        self.status_text.append(f"  📧 Usando {email} como email para o perfil '{username}'")
                    
                    # Verificar se existe arquivo de metadados antigo
                    old_metadata_file = os.path.join(self.dolphin_manager.profiles_dir, username, "metadata.json")
                    if os.path.exists(old_metadata_file):
                        try:
                            os.remove(old_metadata_file)
                            print(f"[DEBUG] Arquivo de metadados antigo removido para {username}")
                        except Exception as e:
                            print(f"[DEBUG] Erro ao remover arquivo antigo: {e}")
                    
                    # Adiciona os metadados com o email e senha corretos
                    print(f"[DEBUG] Salvando metadados para {username} com senha={password[:2]}*** e email={email}")
                    self.dolphin_manager.add_profile_metadata(username, email, password, "Chrome")
                    
                    # Verificar se foi salvo corretamente
                    verificar_metadata = self.dolphin_manager.get_profile_metadata(username)
                    if verificar_metadata and verificar_metadata.get('password') == password:
                        print(f"[DEBUG] Senha salva com sucesso para {username}")
                    else:
                        print(f"[DEBUG] AVISO: Senha pode não ter sido salva corretamente para {username}")
                        # Forçar novamente o salvamento
                        self.dolphin_manager.add_profile_metadata(username, email, password, "Chrome")
                    
                    contador_adicionados += 1
                    
                    # Exibe informações sobre os dados importados
                    self.status_text.append(f"  ✅ Perfil '{username}' importado com sucesso!")
                except Exception as e:
                    self.status_text.append(f"  ❌ Erro ao adicionar '{username}': {e}")
                    contador_erros += 1
        
            # Atualiza a lista de perfis
            self._populate_profiles_list()
        
            # Exibe o resumo da importação
            if contador_adicionados > 0:
                self.status_text.append(f"\n✅ {contador_adicionados} perfil(is) importado(s) com sucesso de {os.path.basename(filePath)}.")
            if contador_erros > 0:
                self.status_text.append(f"\n❌ {contador_erros} erro(s) durante a importação.")
            
            # Exibe mensagem com contagem final
            QMessageBox.information(self, "Importação Concluída", 
                                   f"Importação de perfis concluída!\n\n"
                                   f"Total de linhas processadas: {total_linhas}\n"
                                   f"Perfis importados com sucesso: {contador_adicionados}\n"
                                   f"Erros durante importação: {contador_erros}")
            
            # Se pelo menos um perfil foi adicionado, mostra mensagem de sucesso
            if contador_adicionados > 0:
                self.status_text.append("\n👍 Importação concluída com sucesso!")
            else:
                self.status_text.append("\n⚠️ Não foi possível importar nenhum perfil. Verifique o formato do arquivo.")
                
        except Exception as e:
            self.status_text.append(f"\n❌ Erro ao processar arquivo: {e}")
            QMessageBox.critical(self, "Erro de Importação", f"Ocorreu um erro ao processar o arquivo:\n\n{str(e)}")
        
        # Garantir que a lista de perfis está atualizada
        self._populate_profiles_list()
        
# Método para lidar com seleção de perfil na lista
    def _perfil_selecionado(self):
        """Método chamado quando um perfil é selecionado na lista.
        Ativa o botão 'Entrar no Perfil Selecionado' e armazena o perfil selecionado."""
        itens_selecionados = self.profiles_list_widget.selectedItems()
        if not itens_selecionados:
            # Se nenhum perfil for selecionado, desabilita o botão de login único
            self.login_perfil_button.setEnabled(False)
            self.login_perfil_button.setText("Selecione um Perfil")
            self.perfil_selecionado_atual = None
            return None
        
        item = itens_selecionados[0]
        username = item.data(Qt.UserRole)
        if username:
            # Emite sinal com o nome do usuário selecionado
            if hasattr(self, 'perfil_selecionado_signal'):
                self.perfil_selecionado_signal.emit(username)
            self.perfil_selecionado_atual = username
            # Atualiza o botão de login único
            self.login_perfil_button.setEnabled(True)
            self.login_perfil_button.setText(f"Entrar com {username} 🔐")
            print(f"[DEBUG] Perfil selecionado: {username}. Botão de login ativado.")
            return username
        return None
    
    # Método para logar com o perfil selecionado
    def _atualizar_botao_entrar_perfil(self):
        """Atualiza o texto e estado do botão 'Entrar no Perfil Selecionado' na janela principal."""
        print("[DEBUG] Método _atualizar_botao_entrar_perfil chamado")
        self.status_text.append("[DEBUG] Atualizando botão de entrar no perfil")
        
        # Verifica se há um item selecionado
        itens_selecionados = self.profiles_list_widget.selectedItems()
        
        if not itens_selecionados:
            # Se nenhum perfil estiver selecionado, desabilita o botão central
            if hasattr(self, 'botao_entrar_perfil') and self.botao_entrar_perfil:
                self.botao_entrar_perfil.setEnabled(False)
                self.botao_entrar_perfil.setText("Entrar no Perfil Selecionado 🔒")
            self.login_perfil_button.setEnabled(False)
            self.login_perfil_button.setText("Entrar no Perfil Selecionado 🔒")
        else:
            # Se houver um perfil selecionado, atualiza o botão
            item = itens_selecionados[0]
            username = item.data(Qt.UserRole)
            if username:
                # Atualiza o botão na lista de perfis
                self.login_perfil_button.setEnabled(True)
                self.login_perfil_button.setText(f"Entrar com {username} 🔐")
                
                # Atualiza o botão central se existir
                if hasattr(self, 'botao_entrar_perfil') and self.botao_entrar_perfil:
                    self.botao_entrar_perfil.setEnabled(True)
                    self.botao_entrar_perfil.setText(f"Entrar no Perfil {username} 🔐")
                
                print(f"[DEBUG] Botões atualizados para o perfil: {username}")
    
    def _login_perfil_selecionado(self):
        """Inicia o navegador para o perfil selecionado na lista e faz login automático."""
        print("[DEBUG] Método _login_perfil_selecionado iniciado!")
        self.status_text.append("[DEBUG] Método _login_perfil_selecionado iniciado!")
        
        # Verificar se temos um perfil selecionado
        if not hasattr(self, 'perfil_selecionado_atual'):
            print("[DEBUG] Erro: atributo 'perfil_selecionado_atual' não existe!")
            self.status_text.append("[DEBUG] Erro: atributo 'perfil_selecionado_atual' não existe!")
            return
            
        if not self.perfil_selecionado_atual:
            print("[DEBUG] Erro: perfil_selecionado_atual está vazio!")
            self.status_text.append("❓ Nenhum perfil selecionado. Selecione um perfil na lista primeiro.")
            return
            
        username = self.perfil_selecionado_atual
        self.status_text.append(f"🔍 Iniciando operação para perfil '{username}'...")
        
        # Por padrão, vamos manter o navegador aberto em caso de erro para ajudar o usuário
        keep_open_on_error = True
        self.status_text.append(f"⚠️ Modo de intervenção manual ativado. O navegador permanecerá aberto em caso de erro.")
        
        # Verifica se já existe uma operação em andamento para este perfil
        if hasattr(self, 'dolphin_action_workers') and username in self.dolphin_action_workers:
            if self.dolphin_action_workers[username].isRunning():
                self.status_text.append(f"⚠️ Ação para '{username}' já em progresso. Aguarde.")
                return
        else:
            # Inicializa o dicionário se não existir
            if not hasattr(self, 'dolphin_action_workers'):
                self.dolphin_action_workers = {}
                
        # Obtém metadados do perfil
        metadata = self.dolphin_manager.get_profile_metadata(username)
        print(f"[DEBUG] Metadados obtidos para '{username}': {metadata is not None}")
        if metadata:
            # Debug dos dados encontrados (mostrando de forma segura)
            found_email = metadata.get('email', '')
            found_password = metadata.get('password', '')
            print(f"[DEBUG] Dados encontrados: Email={found_email} | Senha={len(found_password) > 0}")
        else:
            self.status_text.append(f"❌ Metadados não encontrados para '{username}'. Tentando seguir com as informações disponíveis.")
            # Criar metadados mínimos para tentar o login
            metadata = {"username": username, "email": f"{username}@gmail.com", "password": ""}
        
        # Verifica se temos as credenciais necessárias
        email_or_user = metadata.get('email', username)  # Usa o username como fallback
        password = metadata.get('password', "")
        
        print(f"[DEBUG] Senha encontrada para '{username}': {password != ''}")
        
        # Pergunta a senha APENAS se estiver vazia ou se for muito curta (menor que 3 caracteres, provavelmente inválida)
        if not password or len(password) < 3:
            print(f"[DEBUG] Senha não encontrada ou inválida para '{username}', solicitando ao usuário")
            self.status_text.append(f"Senha não encontrada ou inválida para '{username}'. Informe a senha:")
            
            from PyQt5.QtWidgets import QInputDialog
            password, ok = QInputDialog.getText(self, "Senha Necessária", 
                                               f"Digite a senha para o perfil '{username}'", 
                                               QLineEdit.Password)
            if not ok or not password:
                self.status_text.append(f"❌ Operação cancelada. Senha não fornecida para '{username}'")
                return
            
            # Atualizar os metadados com a senha fornecida
            print(f"[DEBUG] Atualizando metadados com a nova senha fornecida para '{username}'")
            metadata["password"] = password
            print(f"[DEBUG] Nova senha definida: '{password[:1]}*****'")
            
            # Verificar se o email está definido corretamente
            if not email_or_user or '@' not in email_or_user:
                email_or_user = f"{username}@gmail.com"
                print(f"[DEBUG] Email corrigido para: {email_or_user}")
                
            # Garantir que os metadados sejam atualizados (forçando a atualização)
            try:
                old_metadata_file = os.path.join(self.dolphin_manager.profiles_dir, username, "metadata.json")
                all_metadata_file = os.path.join(self.dolphin_manager.profiles_dir, "all_profiles_metadata.json")
                
                # Verificar se existe o arquivo de metadados individuais e removê-lo para evitar conflitos
                if os.path.exists(old_metadata_file):
                    print(f"[DEBUG] Removendo arquivo de metadados antigo para {username}")
                    try:
                        os.remove(old_metadata_file)
                    except Exception as e:
                        print(f"[DEBUG] Erro ao remover arquivo antigo: {e}")
                        
                # Forçar atualização no arquivo centralizado
                result = self.dolphin_manager.add_profile_metadata(username, email_or_user, password)
                print(f"[DEBUG] Resultado da atualização de metadados: {result}")
                
                # Verificar se os metadados foram realmente atualizados
                new_metadata = self.dolphin_manager.get_profile_metadata(username)
                print(f"[DEBUG] Verificação após atualização: Senha presente = {bool(new_metadata.get('password'))}")
                
            except Exception as e:
                print(f"[DEBUG] Erro ao atualizar metadados: {e}")
                self.status_text.append(f"Erro ao atualizar metadados: {str(e)}. Tentando continuar...")
                
            # Garantir que a senha está corretamente definida para o processo de login
            metadata["password"] = password
        
        # Exibe informações sobre as credenciais que serão usadas
        self.status_text.append(f"🔐 Usando credenciais para perfil '{username}'")
        
        # Primeiro, lança o navegador com o perfil
        self.status_text.append(f"🚀 Iniciando navegador para '{username}'...")
        
        try:
            # Teste simples: abrir o navegador primeiro sem login
            print(f"[DEBUG] Iniciando a abertura do navegador para o perfil {username}")
            self.status_text.append(f"[DEBUG] Tentando executar launch_profile_instagram({username}, go_to_instagram_home=True)")
            
            success, message = self.dolphin_manager.launch_profile_instagram(username, go_to_instagram_home=True)
            print(f"[DEBUG] Resultado launch_profile_instagram: success={success}, message={message}")
            
            if not success:
                print(f"[DEBUG] FALHA ao abrir navegador: {message}")
                self.status_text.append(f"❌ Falha ao abrir navegador: {message}")
                return
                
            self.status_text.append(f"✅ Navegador aberto com sucesso para '{username}'")
            
            # Verifica se o driver foi criado com sucesso
            driver = self.dolphin_manager.get_profile_driver(username)
            if not driver:
                self.status_text.append(f"❌ Driver não disponível após lançamento para '{username}'")
                return
                
            # SIMPLIFICADO: Vamos sempre tentar fazer login, independente do status atual
            # Isso evita problemas de detecção incorreta de login
            
            self.status_text.append(f"Tentando login automático para '{username}'...")
            print(f"[DEBUG] Tentando login automático para '{username}' com senha={password[:2]}{'*' * (len(password)-2) if len(password) > 2 else ''}")
            
            # Dados para login
            login_data = {
                "username": username,
                "password": password 
            }
            
            # Forçar navegação para página de login
            self.status_text.append("Forçando navegação para página de login...")
            driver.get("https://www.instagram.com/accounts/login/")
            time.sleep(3)  # Aguardar carregamento da página
            
            try:
                # Buscar campos de login
                from selenium.webdriver.common.by import By
                from selenium.webdriver.support.ui import WebDriverWait
                from selenium.webdriver.support import expected_conditions as EC
                
                # Localizar campos de login
                self.status_text.append("Localizando campos de login...")
                print("[DEBUG] Buscando campos de login username/password")
                
                # Esperar até que os campos estejam visíveis
                try:
                    login_field = WebDriverWait(driver, 5).until(
                        EC.presence_of_element_located((By.NAME, "username"))
                    )
                    password_field = WebDriverWait(driver, 5).until(
                        EC.presence_of_element_located((By.NAME, "password"))
                    )
                    print("[DEBUG] Campos de login encontrados com sucesso!")
                    
                    # Limpar e preencher campos
                    login_field.clear()
                    password_field.clear()
                    login_field.send_keys(login_data["username"])
                    password_field.send_keys(login_data["password"])
                    print("[DEBUG] Campos preenchidos! Usuario e senha inseridos.")
                    
                    # Localizar e clicar no botão de login
                    login_button = WebDriverWait(driver, 5).until(
                        EC.element_to_be_clickable((By.XPATH, "//button[@type='submit']" ))
                    )
                    print("[DEBUG] Botão de login encontrado!")
                    
                    # Clicar no botão
                    self.status_text.append("Clicando no botão de login...")
                    login_button.click()
                    print("[DEBUG] Botão de login clicado!")
                    
                    # Aguardar processamento
                    self.status_text.append("Aguardando processamento do login...")
                    time.sleep(5)
                    
                    # Verificar resultado
                    current_url = driver.current_url
                    print(f"[DEBUG] URL após tentativa de login: {current_url}")
                    
                    if "challenge" in current_url.lower():
                        self.status_text.append(f"⚠️ Desafio de verificação detectado para '{username}'")
                        self.status_text.append("O navegador foi mantido aberto para intervenção manual.")
                        self.dolphin_manager.update_profile_bot_login_status(username, "aguardando_intervencao", "Desafio de verificação detectado")
                    elif "accounts/login" in current_url.lower():
                        self.status_text.append(f"❌ Falha no login para '{username}'. Senha incorreta ou problema de conexão.")
                        self.status_text.append("O navegador foi mantido aberto para intervenção manual.")
                        self.dolphin_manager.update_profile_bot_login_status(username, "aguardando_intervencao", "Falha no login - Senha incorreta?")
                    else:
                        # Verificar elementos da página para confirmar login
                        try:
                            # Buscar um elemento que só aparece quando logado
                            avatar_element = driver.find_elements(By.XPATH, "//*[@aria-label='Perfil' or @aria-label='Profile']")
                            if avatar_element:
                                self.status_text.append(f"✅ Login realizado com sucesso para '{username}'!")
                                self.dolphin_manager.update_profile_bot_login_status(username, "conectado", "Login realizado com sucesso")
                            else:
                                self.status_text.append(f"⚠️ Login inconclusivo para '{username}'. O navegador foi mantido aberto.")
                                self.dolphin_manager.update_profile_bot_login_status(username, "aguardando_intervencao", "Login inconclusivo")
                        except Exception as e:
                            print(f"[DEBUG] Erro ao verificar elementos após login: {e}")
                            self.status_text.append(f"⚠️ Login inconclusivo para '{username}'. O navegador foi mantido aberto.")
                            self.dolphin_manager.update_profile_bot_login_status(username, "aguardando_intervencao", "Erro ao verificar login")
                    
                except Exception as e:
                    print(f"[DEBUG] Erro ao aguardar/localizar elementos de login: {e}")
                    self.status_text.append(f"❌ Erro ao localizar campos de login: {str(e)}")
                    self.status_text.append("O navegador foi mantido aberto para intervenção manual.")
                    self.dolphin_manager.update_profile_bot_login_status(username, "aguardando_intervencao", f"Erro na interface: {str(e)[:30]}")
                
            except Exception as e:
                print(f"[DEBUG] Erro geral no processo de login: {e}")
                self.status_text.append(f"❌ Erro ao tentar login: {str(e)}")
                self.status_text.append("O navegador foi mantido aberto para intervenção manual.")
                self.dolphin_manager.update_profile_bot_login_status(username, "aguardando_intervencao", f"Erro: {str(e)[:30]}")
            
            # Atualiza o status do botão
            if hasattr(self, '_update_profile_button_text'):
                self._update_profile_button_text(username)
            return
            
        except Exception as e:
            self.status_text.append(f"❌ Erro ao processar operação: {str(e)}")
            import traceback
            self.status_text.append(f"Detalhes do erro: {traceback.format_exc()[:300]}...")
            return
            
    def _populate_profiles_list(self):
        """Atualiza a lista de perfis com base nos metadados do Dolphin Anty."""
        # Salva o perfil atualmente selecionado para restaurar depois
        perfil_selecionado = None
        if hasattr(self, 'perfil_selecionado_atual') and self.perfil_selecionado_atual:
            perfil_selecionado = self.perfil_selecionado_atual
            
        # Limpa a lista atual
        self.profiles_list_widget.clear()
        
        # Obtém todos os perfis e seus metadados
        perfis_metadata = self.dolphin_manager.get_all_profiles_metadata()
        
        # Atualiza o contador de perfis
        self.perfis_count_label.setText(f"Perfis cadastrados: {len(perfis_metadata)}")
        
        # Adiciona cada perfil à lista
        for username, metadata in perfis_metadata.items():
            # Cria um item para a lista
            item = QListWidgetItem(username)
            item.setData(Qt.UserRole, username)  # Armazena o nome do usuário
            
            # Define o status e a cor do item com base nos metadados
            bot_login_status = metadata.get('bot_login_status', 'desconectado')
            account_status = metadata.get('account_status', None)
            
            # Define estilo baseado no status
            if bot_login_status == "conectado":
                item.setBackground(QColor(74, 175, 80, 80))  # Verde claro
            elif bot_login_status in ["erro_login", "erro_ao_abrir"]:
                item.setBackground(QColor(244, 67, 54, 80))  # Vermelho claro
            
            # Adiciona o item à lista
            self.profiles_list_widget.addItem(item)
            
        # Se havia um perfil selecionado antes, tenta restaurar a seleção
        if perfil_selecionado:
            itens = self.profiles_list_widget.findItems(perfil_selecionado, Qt.MatchExactly)
            if itens:
                self.profiles_list_widget.setCurrentItem(itens[0])
                self._perfil_selecionado()
    
    def _filtrar_perfis(self, texto_pesquisa):
        """Filtra a lista de perfis com base no texto de pesquisa."""
        # Se o campo de pesquisa estiver vazio, restaura todos os perfis
        if not texto_pesquisa:
            # Mostra todos os itens da lista
            for i in range(self.profiles_list_widget.count()):
                self.profiles_list_widget.item(i).setHidden(False)
            return
            
        # Remove acentos para facilitar a busca
        texto_pesquisa = texto_pesquisa.lower()
        
        # Filtra os itens com base no texto de pesquisa
        for i in range(self.profiles_list_widget.count()):
            item = self.profiles_list_widget.item(i)
            username = item.text()
            # Esconde o item se não contiver o texto de pesquisa
            item.setHidden(texto_pesquisa not in username.lower())
            
    def _limpar_lista_perfis(self):
        """Limpa todos os perfis cadastrados após confirmação do usuário."""
        # Pergunta ao usuário se realmente deseja limpar a lista
        resposta = QMessageBox.question(self, "Confirmar exclusão", 
                                      "Tem certeza que deseja excluir TODOS os perfis cadastrados?\n\nEssa ação não pode ser desfeita!", 
                                      QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
        
        if resposta == QMessageBox.Yes:
            # Obter a lista de perfis usando o método correto
            perfis_metadata = self.dolphin_manager.get_all_profiles_metadata()
            perfis = list(perfis_metadata.keys())  # Extrair apenas os nomes dos perfis
            total_perfis = len(perfis)
            
            # Começa a remover os perfis
            self.status_text.append(f"🗑️ Removendo {total_perfis} perfis...")
            contador_removidos = 0
            
            for perfil in perfis:
                try:
                    # Fecha o driver se estiver aberto
                    self.dolphin_manager.close_profile_driver(perfil)
                    # Remove o perfil
                    self.dolphin_manager.delete_profile(perfil)
                    contador_removidos += 1
                    self.status_text.append(f"➖ Removido: '{perfil}'")
                except Exception as e:
                    self.status_text.append(f"⚠️ Erro ao remover perfil '{perfil}': {str(e)}")
            
            # Limpa a lista de perfis na interface
            self.profiles_list_widget.clear()
            
            # Atualiza a contagem na interface
            self.perfis_count_label.setText(f"Perfis cadastrados: 0")
            
            # Atualiza a lista e exibe mensagem
            self.status_text.append(f"✅ {contador_removidos} perfis foram removidos com sucesso!")
        else:
            self.status_text.append("⚠️ Operação de limpeza cancelada pelo usuário.")
            
    def _limpar_arquivos_temporarios(self):
        """Limpa arquivos temporários e cache sem afetar perfis conectados."""
        try:
            # Mostrar mensagem explicativa sobre o processo
            msg = QMessageBox(self)
            msg.setWindowTitle("Limpeza de Arquivos Temporários")
            msg.setText("Esta função limpará arquivos temporários e cache dos perfis, preservando cookies e dados de perfis que estejam conectados atualmente.")
            msg.setInformativeText("Deseja realizar a limpeza agora?")
            msg.setIcon(QMessageBox.Information)
            msg.setStandardButtons(QMessageBox.Yes | QMessageBox.No)
            msg.setDefaultButton(QMessageBox.Yes)
            
            # Botões claros e com descrição do que cada um faz
            limpar_button = msg.button(QMessageBox.Yes)
            limpar_button.setText("Limpar Arquivos")
            cancelar_button = msg.button(QMessageBox.No)
            cancelar_button.setText("Cancelar")
            
            # Exibir a mensagem e aguardar resposta
            resposta = msg.exec_()
            
            if resposta == QMessageBox.Yes:
                # Obtém a lista de perfis conectados para preservar seus caches
                perfis_conectados = []
                all_metadata = self.dolphin_manager.get_all_profiles_metadata()
                
                for username, metadata in all_metadata.items():
                    if metadata.get('bot_login_status') in ['conectado', 'ativo']:
                        perfis_conectados.append(username)
                
                # Atualiza a interface com mensagem de início
                self.status_text.append(f"\n🚮 Iniciando limpeza de arquivos temporários... Preservando {len(perfis_conectados)} perfis conectados.")
                
                # Executar a limpeza
                total_removidos, bytes_liberados = self.dolphin_manager.clean_temporary_files(perfis_conectados)
                
                # Calcular tamanho em MB ou GB para exibição
                if bytes_liberados > 1024 * 1024 * 1024:  # Mais de 1 GB
                    tamanho_formatado = f"{bytes_liberados / (1024 * 1024 * 1024):.2f} GB"
                else:
                    tamanho_formatado = f"{bytes_liberados / (1024 * 1024):.2f} MB"
                
                # Exibir resultado
                self.status_text.append(f"✅ Limpeza concluída! {total_removidos} arquivos/diretórios removidos.")
                self.status_text.append(f"💾 Espaço liberado: {tamanho_formatado}")
                
                # Mostrar mensagem de sucesso em popup
                QMessageBox.information(self, "Limpeza Concluída", 
                                       f"Limpeza de temporários finalizada com sucesso!\n\n" + 
                                       f"Total de itens removidos: {total_removidos}\n" + 
                                       f"Espaço em disco liberado: {tamanho_formatado}")
            else:
                self.status_text.append("\nℹ️ Limpeza de arquivos temporários cancelada pelo usuário.")
                
        except Exception as e:
            # Relatar erro
            self.status_text.append(f"\n❌ Erro durante limpeza de arquivos temporários: {str(e)}")
            QMessageBox.critical(self, "Erro na Limpeza", f"Ocorreu um erro ao limpar os arquivos temporários:\n\n{str(e)}")
            import traceback
            print(f"[DEBUG] Erro detalhado na limpeza: {traceback.format_exc()}")
    
    def _launch_selected_profile(self, item):
        """Abre o navegador quando o usuário clica duas vezes em um perfil."""
        # Extrai o nome de usuário do item selecionado
        username = item.data(Qt.UserRole)
        if not username:
            return
            
        self.status_text.append(f"👀 Clique duplo detectado no perfil '{username}'")
        # Define o perfil como selecionado
        self.perfil_selecionado_atual = username
        # Atualiza o botão de login
        self.login_perfil_button.setEnabled(True)
        self.login_perfil_button.setText(f"Entrar com {username}")
        # Inicia o navegador
        self._login_perfil_selecionado()
    
    def _on_dolphin_action_completed(self, username, success, final_status, message, original_action):
        """Manipula o evento de conclusão de ação do Dolphin."""
        self.status_text.append(f" Ação '{original_action}' para '{username}' concluída. Sucesso: {success}. Mensagem: {message}")
        # O DolphinAntyManager já atualizou o status nos metadados.
        # A GUI só precisa refletir esse status no botão.
        self._update_profile_button_text(username) # Passa None para button_instance, pois ele buscará em self.profile_buttons
        # Atualiza a lista completa de perfis para refletir status atualizado
        self._populate_profiles_list()
        if username in self.dolphin_action_workers:
            del self.dolphin_action_workers[username] # Remove a referência à worker que terminou

    def _toggle_password_input_enable(self, state):
        is_checked = (state == Qt.Checked)
        self.password_input.setEnabled(is_checked)
        if is_checked:
            # e define o placeholder apropriado.
            senha_padrao_salva = self.settings.value("base_password", "") # Usar string vazia como default se não houver nada salvo
            self.password_input.setText(senha_padrao_salva)
            self.password_input.setPlaceholderText("Senha Padrão para todas as contas")
        else:
            # Se desmarcado, limpa o campo e define o placeholder para aleatório.
            self.password_input.setText("") # Limpa o texto atual
            self.password_input.setPlaceholderText("Senhas serão geradas aleatoriamente")
    def load_settings(self):
        """Carrega as configurações salvas anteriormente."""
        self.ano_input.setValue(int(self.settings.value("nascimento_ano", 2000)))
        self.idade_min_input.setValue(int(self.settings.value("idade_min", 18)))
        self.idade_max_input.setValue(int(self.settings.value("idade_max", 45)))
        # self.intervalo_criacao_input.setText(self.settings.value("intervalo_criacao", "60-120")) # Removido daqui
        # self.intervalo_email_input.setText(self.settings.value("intervalo_email_check", "10")) # Removido daqui
        self.manual_fullname_input.setText(self.settings.value("manual_fullname", ""))
        self.username_input_config.setText(self.settings.value("base_username_config", ""))
        # self.password_input.setText(self.settings.value("base_password", "")) # REMOVIDO
        self.quantity_input.setText(self.settings.value("base_quantity", "1"))
        self.senha_padrao_checkbox.setChecked(self.settings.value("usar_senha_padrao", True, type=bool))
        self._toggle_password_input_enable(self.senha_padrao_checkbox.isChecked())
        self.genero_combo.setCurrentText(self.settings.value("genero_selecionado", "Aleatório"))
        self.intervalo_criacao_input.setText(self.settings.value("intervalo_criacao", "60-120")) # ADICIONADO AQUI
        self.intervalo_email_input.setText(self.settings.value("intervalo_email_check", "10")) # ADICIONADO AQUI

        foto_path = self.settings.value("caminho_foto_perfil", None) # Linha de referência
        self.caminho_foto_perfil_selecionada = foto_path
        
        self.num_fotos_postar_spinbox.setValue(self.settings.value("num_fotos_postar", 0, type=int))
        self.intervalo_posts_input.setText(self.settings.value("intervalo_posts", "5"))
        self.consultar_email_auto_checkbox.setChecked(self.settings.value("consultar_email_auto", True, type=bool))
        self._sincronizar_genero_bio(self.genero_combo.currentText()) # Sincroniza após outros combos serem carregados (MOVIDO PARA CÁ)
        self._toggle_manual_code_input(self.consultar_email_auto_checkbox.isChecked())
    def salvar_configuracoes(self):
        """Salva as configurações atuais."""
        self.settings.setValue("intervalo_criacao", self.intervalo_criacao_input.text())
        self.settings.setValue("intervalo_email_check", self.intervalo_email_input.text())
        self.settings.setValue("manual_fullname", self.manual_fullname_input.text())
        self.settings.setValue("base_username_config", self.username_input_config.text())
        # self.settings.setValue("base_password", self.password_input.text()) # REMOVIDO
        self.settings.setValue("base_quantity", self.quantity_input.text())
        self.settings.setValue("usar_senha_padrao", self.senha_padrao_checkbox.isChecked())
        # ADICIONADO:
        if self.senha_padrao_checkbox.isChecked():
            self.settings.setValue("base_password", self.password_input.text())
        # else: Não salva/altera "base_password" se o checkbox estiver desmarcado,
        # preservando a senha padrão anteriormente salva.
        self.settings.setValue("genero_selecionado", self.genero_combo.currentText())
        
    def _iniciar_automacao_acoes(self):
        """Inicia a automação de ações em posts do Instagram usando os perfis do Dolphin Anty."""
        # Verifica se já existe uma automação em andamento
        if self.automacao_worker and self.automacao_worker.isRunning():
            self.status_text.append("⚠️ Já existe uma automação em andamento. Aguarde ou cancele a atual.")
            return
            
        # Verifica se a URL do post foi preenchida
        post_url = self.post_url_input.text().strip()
        if not post_url:
            self.status_text.append("❌ Por favor, informe a URL do post do Instagram.")
            return
            
        # Verifica se pelo menos uma ação foi selecionada
        if not self.curtir_checkbox.isChecked() and not self.comentar_checkbox.isChecked():
            self.status_text.append("❌ Por favor, selecione pelo menos uma ação (curtir ou comentar).")
            return
            
        # Se a opção de comentar estiver marcada, verifica se o texto do comentário foi preenchido
        if self.comentar_checkbox.isChecked():
            comentario = self.comentario_input.toPlainText().strip()
            if not comentario:
                self.status_text.append("❌ Por favor, insira pelo menos um comentário.")
                return
        else:
            comentario = ""
            
        # Obtém a lista de perfis disponíveis
        all_profiles_metadata = self.dolphin_manager.get_all_profiles_metadata()
        if not all_profiles_metadata:
            self.status_text.append("❌ Não há perfis cadastrados para realizar a automação.")
            return
            
        # Obtém os perfis disponíveis (todos os perfis cadastrados)
        perfis_disponiveis = list(all_profiles_metadata.keys())
        
        # Obtém os parâmetros da automação
        total_acoes = self.acoes_spinbox.value()
        perfis_simultaneos = self.perfis_simult_spinbox.value()
        tempo_entre_acoes = self.tempo_acoes_spinbox.value()
        curtir = self.curtir_checkbox.isChecked()
        comentar = self.comentar_checkbox.isChecked()
        
        # Cria e configura o worker para automação
        self.automacao_worker = AutomacaoAcoesWorker(
            self.dolphin_manager,
            post_url,
            perfis_disponiveis,
            total_acoes,
            perfis_simultaneos,
            tempo_entre_acoes,
            curtir,
            comentar,
            comentario
        )
        
        # Conecta os sinais do worker
        self.automacao_worker.status_update.connect(self.status_text.append)
        self.automacao_worker.progresso_atualizado.connect(self._atualizar_progresso_automacao)
        self.automacao_worker.acao_concluida.connect(self._on_acao_automacao_concluida)
        self.automacao_worker.automacao_concluida.connect(self._on_automacao_concluida)
        
        # Atualiza a interface
        self.iniciar_automacao_button.setText("⏹️ Parar Automação")
        self.iniciar_automacao_button.setStyleSheet("""
            QPushButton {
                background-color: #c0392b;
                color: white;
                padding: 8px;
                border-radius: 4px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #e74c3c;
            }
        """)
        self.iniciar_automacao_button.setEnabled(True)  # Garante que o botão fique habilitado durante a automação
        try:
            self.iniciar_automacao_button.clicked.disconnect()
        except Exception:
            pass
        # Só conecta se o método realmente existe
        if hasattr(self, '_parar_automacao_acoes'):
            self.iniciar_automacao_button.clicked.connect(self._parar_automacao_acoes)
        else:
            self.status_text.append("[ERRO] Método _parar_automacao_acoes não encontrado para conectar ao botão!")
        
        # Desabilita os campos de configuração durante a automação
        self._toggle_campos_automacao(False)
        
        # Inicia a automação
        self.status_text.append(f"🚀 Iniciando automação de {total_acoes} ações com {perfis_simultaneos} perfis simultâneos...")
        
        # Inicia o thread de automação
        try:
            self.automacao_worker.start()
        except Exception as e:
            self.status_text.append(f"❌ Erro ao iniciar automação: {str(e)}")
            self._on_automacao_concluida()
        
    def _adicionar_usuario_tabela(self, usuario, senha, status="Pendente"):
        """Adiciona um usuário à tabela de contas para teste."""
        row = self.tabela_usuarios.rowCount()
        self.tabela_usuarios.insertRow(row)
        # Criar itens para a tabela
        usuario_item = QTableWidgetItem(usuario)
        senha_item = QTableWidgetItem(senha)
        status_item = QTableWidgetItem(status)
        # Definir cores conforme o status
        if status == "Conectado" or status == "Já possui cookies/cache":
            status_item.setForeground(Qt.green)
        elif status == "Pendente":
            status_item.setForeground(Qt.gray)
        elif "erro" in status.lower() or "falha" in status.lower():
            status_item.setForeground(Qt.red)
        # Adicionar itens na tabela
        self.tabela_usuarios.setItem(row, 0, usuario_item)
        self.tabela_usuarios.setItem(row, 1, senha_item)
        self.tabela_usuarios.setItem(row, 2, status_item)
        # Adicionar à lista de contas salvas
        self.teste_login_contas_salvas.append((usuario, senha, status))
        
    def _limpar_lista_contas_teste(self):
        """Limpa todas as contas da lista de teste."""
        # Confirmar com o usuário se realmente deseja limpar a lista
        confirmar = QMessageBox.question(
            self,
            "Confirmar Limpeza",
            "Tem certeza que deseja remover TODAS as contas da lista de teste?",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        
        if confirmar == QMessageBox.Yes:
            # Limpar a tabela
            self.tabela_usuarios.setRowCount(0)
            
            # Salvar a lista vazia
            self._salvar_lista_usuarios()
            
            # Limpar a lista de resultados do teste
            self.teste_login_resultados_list.clear()
            
            # Atualizar contadores de status
            self.contador_logins_ok = 0
            self.contador_senhas_incorretas = 0
            self.atualizar_contadores_status()
            
            # Atualizar status
            self.teste_login_status_label.setText("Lista de contas limpa com sucesso.")
            self.status_text.append("\n🔄 Lista de contas para teste limpa com sucesso.")
    
    def _salvar_lista_usuarios(self):
        """Salva a lista de usuários em um arquivo JSON."""
        try:
            if os.path.exists("contas_teste_login.json"):
                with open("contas_teste_login.json", "r", encoding="utf-8") as f:
                    contas = json.load(f)
                    
                # Limpar tabela atual
                self.tabela_usuarios.setRowCount(0)
                self.teste_login_contas_salvas = []
                
                # Preencher tabela com dados carregados
                for conta in contas:
                    usuario = conta.get("usuario", "")
                    senha = conta.get("senha", "")
                    status = conta.get("status", "Pendente")
                    self._adicionar_usuario_tabela(usuario, senha, status)
        except Exception as e:
            print(f"[DEBUG] Erro ao carregar lista de usuários: {e}")
    
    # Métodos para a nova funcionalidade de teste de login
    def _importar_lista_login(self):
        """Importa lista de usuários e senhas de um arquivo e adiciona na tabela."""
        try:
            # Abrir diálogo para selecionar o arquivo
            file_path, _ = QFileDialog.getOpenFileName(self, "Selecionar arquivo TXT", "", "Arquivos de texto (*.txt)")
            if not file_path:
                return
            
            # Contar número de linhas para informar ao usuário
            contas_importadas = 0
            contas_invalidas = 0
            
            # Ler o arquivo e processar cada linha
            with open(file_path, 'r', encoding='utf-8') as file:
                for linha in file:
                    linha = linha.strip()
                    if not linha or ',' not in linha:
                        contas_invalidas += 1
                        continue
                    
                    # Formato esperado: usuario,senha
                    partes = linha.split(',', 1)  # Divide apenas na primeira vírgula
                    if len(partes) != 2:
                        contas_invalidas += 1
                        continue
                    
                    usuario, senha = partes
                    usuario = usuario.strip()
                    senha = senha.strip()
                    
                    # Verificar se o usuário já existe na tabela
                    usuario_existe = False
                    for i in range(self.tabela_usuarios.rowCount()):
                        if self.tabela_usuarios.item(i, 0).text() == usuario:
                            usuario_existe = True
                            break
                    
                    if not usuario_existe:
                        self._adicionar_usuario_tabela(usuario, senha)
                        contas_importadas += 1
            
            # Salvar a lista de usuários
            self._salvar_lista_usuarios()
            
            # Informar ao usuário sobre a importação
            mensagem = f"Importação concluída:\n- {contas_importadas} contas importadas"
            if contas_invalidas > 0:
                mensagem += f"\n- {contas_invalidas} linhas inválidas ignoradas"
            
            QMessageBox.information(self, "Importação Concluída", mensagem)
            
        except Exception as e:
            QMessageBox.warning(self, "Erro na Importação", f"Ocorreu um erro ao importar o arquivo: {str(e)}")

    def _adicionar_usuario_tabela(self, usuario, senha, status="Pendente"):
        """Adiciona um usuário à tabela de contas para teste."""
        row_count = self.tabela_usuarios.rowCount()
        self.tabela_usuarios.insertRow(row_count)
        
        # Usuário
        usuario_item = QTableWidgetItem(usuario)
        self.tabela_usuarios.setItem(row_count, 0, usuario_item)
        
        # Senha
        senha_item = QTableWidgetItem(senha)
        self.tabela_usuarios.setItem(row_count, 1, senha_item)
        
        # Status
        status_item = QTableWidgetItem(status)
        if status == "Pendente":
            status_item.setForeground(Qt.gray)
        elif status == "ATIVO":
            status_item.setForeground(Qt.green)
        elif "ERRO" in status or "SENHA" in status:
            status_item.setForeground(Qt.red)
        else:
            status_item.setForeground(Qt.yellow)
        
        self.tabela_usuarios.setItem(row_count, 2, status_item)

    def _salvar_lista_usuarios(self):
        """Salva a lista de usuários em um arquivo JSON para persistência entre sessões."""
        try:
            dados = []
            for i in range(self.tabela_usuarios.rowCount()):
                usuario = self.tabela_usuarios.item(i, 0).text()
                senha = self.tabela_usuarios.item(i, 1).text()
                status = self.tabela_usuarios.item(i, 2).text()
                dados.append({"usuario": usuario, "senha": senha, "status": status})
            
            with open("usuarios_instagram.json", "w", encoding="utf-8") as file:
                json.dump(dados, file, indent=4, ensure_ascii=False)
        except Exception as e:
            print(f"[DEBUG] Erro ao salvar lista de usuários: {e}")
    
    def _carregar_lista_usuarios(self):
        """Carrega a lista de usuários do arquivo JSON."""
        try:
            if os.path.exists("usuarios_instagram.json"):
                with open("usuarios_instagram.json", "r", encoding="utf-8") as file:
                    dados = json.load(file)
                
                # Limpar tabela primeiro
                self.tabela_usuarios.setRowCount(0)
                
                # Adicionar usuários
                for item in dados:
                    usuario = item.get("usuario", "")
                    senha = item.get("senha", "")
                    status = item.get("status", "Pendente")
                    self._adicionar_usuario_tabela(usuario, senha, status)
        except Exception as e:
            print(f"[DEBUG] Erro ao carregar lista de usuários: {e}")
            
    def _iniciar_teste_login(self):
        """Inicia o processo de teste de login para as contas na tabela."""
        # Verificar se há contas para testar
        if self.tabela_usuarios.rowCount() == 0:
            QMessageBox.warning(self, "Sem Contas", "Não há contas para testar. Importe contas primeiro.")
            return
        
        # Verificar se já há um teste em andamento
        if hasattr(self, 'teste_login_em_andamento') and self.teste_login_em_andamento:
            QMessageBox.warning(self, "Teste em Andamento", "Já há um teste de login em andamento.")
            return
        
        # Preparar o teste
        self.teste_login_em_andamento = True
        self.teste_login_contas = []
        
        # Coletar todas as contas da tabela
        for i in range(self.tabela_usuarios.rowCount()):
            usuario = self.tabela_usuarios.item(i, 0).text()
            senha = self.tabela_usuarios.item(i, 1).text()
            self.teste_login_contas.append((usuario, senha))
        
        # Inicializar contadores e status
        self.teste_login_total = len(self.teste_login_contas)
        self.teste_login_indice_atual = 0
        self.teste_login_resultados_list.clear()
        
        # Contadores para logins bem-sucedidos e senhas incorretas
        self.logins_bem_sucedidos = 0
        self.senhas_incorretas = 0
        
        # Atualizar interface
        self.teste_login_status_label.setText("Status: Iniciando teste de login...")
        self.teste_login_progress_label.setText(f"Progresso: 0/{self.teste_login_total}")
        self.iniciar_teste_login_button.setEnabled(False)
        
        # Iniciar o primeiro teste
        self._testar_proxima_conta()
    
    def _testar_proxima_conta(self):
        """Testa o login da próxima conta na lista."""
        if not self.teste_login_em_andamento or self.teste_login_indice_atual >= self.teste_login_total:
            self._finalizar_teste_login()
            return
        
        usuario, senha = self.teste_login_contas[self.teste_login_indice_atual]
        
        # Verificar se a conta já está marcada como ATIVO
        for i in range(self.tabela_usuarios.rowCount()):
            if self.tabela_usuarios.item(i, 0).text() == usuario:
                status_atual = self.tabela_usuarios.item(i, 2).text()
                if "ATIVO" in status_atual:
                    print(f"[DEBUG] Pulando {usuario} pois já está ATIVO")
                    # Adicionar item à lista de resultados
                    item = QListWidgetItem(f"{usuario}: Pulado (já está ATIVO)")
                    item.setData(Qt.UserRole, usuario)
                    item.setForeground(QColor("green"))
                    self.teste_login_resultados_list.addItem(item)
                    self.teste_login_resultados_list.scrollToBottom()
                    
                    # Incrementar contador e continuar para o próximo
                    self.teste_login_indice_atual += 1
                    if self.teste_login_indice_atual < self.teste_login_total:
                        QTimer.singleShot(500, self._testar_proxima_conta)  # Reduzido para 0.5 segundo
                    else:
                        self._finalizar_teste_login()
                    return
                break
        
        # Fechar todos os navegadores abertos
        try:
            # Obter lista de perfis com drivers ativos
            for profile_name, driver in self.dolphin_manager.profile_drivers.items():
                if driver is not None:
                    print(f"[DEBUG] Fechando navegador de {profile_name}")
                    self.dolphin_manager.close_profile_driver(profile_name)
        except Exception as e:
            print(f"[DEBUG] Erro ao fechar navegadores: {e}")
        
        # Aguardar 2 segundos para garantir que os navegadores foram fechados
        time.sleep(2)
        
        self.teste_login_status_label.setText(f"Status: Verificando {usuario}...")
        
        # Atualizar status na tabela para "Testando..."
        for i in range(self.tabela_usuarios.rowCount()):
            if self.tabela_usuarios.item(i, 0).text() == usuario:
                status_item = self.tabela_usuarios.item(i, 2)
                status_item.setText("Testando...")
                status_item.setForeground(Qt.gray)
                break
        
        # Adicionar item à lista de resultados
        item = QListWidgetItem(f"{usuario}: Iniciando teste...")
        item.setData(Qt.UserRole, usuario)
        self.teste_login_resultados_list.addItem(item)
        self.teste_login_resultados_list.scrollToBottom()
        
        # Atualizar progresso
        self.teste_login_progress_label.setText(f"Progresso: {self.teste_login_indice_atual + 1}/{self.teste_login_total}")
        
        # Iniciar o processo de login
        self._iniciar_teste_login_conta(usuario, senha)
        
    def _iniciar_teste_login_conta(self, usuario, senha):
        """Inicia o processo de login para uma conta específica."""
        # Iniciar o worker para fazer login
        login_worker = DolphinActionWorker(self.dolphin_manager, usuario, "launch_and_login", senha, usuario, parent=self)
        login_worker.action_completed.connect(self._on_teste_login_concluido)
        login_worker.status_update.connect(lambda msg: self.teste_login_status_label.setText(f"Status: {msg}"))
        
        # Guardar o worker atual
        self.teste_login_worker_atual = login_worker
        self.teste_login_worker_atual.start()
    
    def _on_teste_login_concluido(self, username, success, final_status, message, original_action):
        """Chamado quando um teste de login é concluído."""
        # Atualizar status na tabela
        for i in range(self.tabela_usuarios.rowCount()):
            if self.tabela_usuarios.item(i, 0).text() == username:
                status_item = self.tabela_usuarios.item(i, 2)
                if message == "SUSPENSA":
                    status_item.setText("Conta Suspensa")
                    status_item.setForeground(QColor("orange"))
                elif success:
                    # Definir status de acordo com a verificação de acesso à página de edição
                    if "ATIVO" in message:
                        status_item.setText("ATIVO")
                        status_item.setForeground(Qt.green)
                        self.logins_bem_sucedidos += 1
                    else:
                        status_item.setText("Conectado (Acesso Limitado)")
                        status_item.setForeground(QColor("orange"))
                else:
                    if "senha" in message.lower():
                        status_item.setText("Senha Incorreta")
                        status_item.setForeground(Qt.red)
                        self.senhas_incorretas += 1
                    else:
                        status_item.setText(f"Erro: {message}")
                        status_item.setForeground(Qt.red)
                break
        
        # Adicionar resultado à lista
        if message == "SUSPENSA":
            item = QListWidgetItem(f"{username}: ⚠️ Conta Suspensa")
            item.setForeground(QColor("orange"))
        elif success:
            if "ATIVO" in message:
                item = QListWidgetItem(f"{username}: ✅ Login bem-sucedido e ATIVO")
                item.setForeground(QColor("green"))
            else:
                item = QListWidgetItem(f"{username}: ⚠️ Login feito mas sem confirmação de ATIVO")
                item.setForeground(QColor("orange"))
        else:
            if "senha" in message.lower():
                item = QListWidgetItem(f"{username}: ❌ Senha incorreta")
                item.setForeground(QColor("red"))
            else:
                item = QListWidgetItem(f"{username}: ❌ {message}")
                item.setForeground(QColor("red"))
        
        item.setData(Qt.UserRole, username)
        self.teste_login_resultados_list.addItem(item)
        self.teste_login_resultados_list.scrollToBottom()
        
        # Salvar a tabela atualizada
        self._salvar_lista_usuarios()
        
        # Atualizar o status com a contagem em tempo real
        status_texto = f"Status: Sucesso: {self.logins_bem_sucedidos} | Senhas Incorretas: {self.senhas_incorretas} | Aguardando..."
        self.teste_login_status_label.setText(status_texto)
        
        # Atualizar o progresso
        self.teste_login_progress_label.setText(f"Progresso: {self.teste_login_indice_atual + 1}/{self.teste_login_total}")
        
        # Verificar se o login foi bem-sucedido, conta está suspensa ou houve erro
        if message == "SUSPENSA" or success:
            # Se foi bem-sucedido ou é uma conta suspensa, fechar o navegador normalmente
            try:
                print(f"[DEBUG] Fechando navegador para {username}")
                self.dolphin_manager.close_profile_driver(username)
                time.sleep(2)  # Reduzido para 2 segundos
                print(f"[DEBUG] Navegador fechado para {username}")
            except Exception as e:
                print(f"[DEBUG] Erro ao fechar navegador para {username}: {e}")
            
            # Avançar para o próximo perfil
            self.teste_login_indice_atual += 1
            if self.teste_login_indice_atual < self.teste_login_total:
                # Aguardar antes de avançar para o próximo teste
                self.teste_login_status_label.setText(f"Status: Aguardando para próximo teste... Sucesso: {self.logins_bem_sucedidos} | Senhas Incorretas: {self.senhas_incorretas}")
                QTimer.singleShot(3000, self._testar_proxima_conta)  # Reduzido para 3 segundos
            else:
                # Finalizar o teste
                QTimer.singleShot(1000, self._finalizar_teste_login)
        else:
            # Se ocorreu falha no login (exceto conta suspensa), manter o navegador aberto para intervenção manual
            if message != "SUSPENSA":
                botao_verificar = QPushButton(f"Verificar Login Manual de {username}")
                botao_verificar.setStyleSheet("background-color: green; color: white;")
                botao_verificar.clicked.connect(lambda: self._verificar_login_manual(username))
                
                botao_fechar = QPushButton(f"Fechar e Pular {username}")
                botao_fechar.setStyleSheet("background-color: red; color: white;")
                botao_fechar.clicked.connect(lambda: self._fechar_e_pular_perfil(username))
                
                # Adicionar os botões à interface
                botoes_layout = QHBoxLayout()
                botoes_layout.addWidget(botao_verificar)
                botoes_layout.addWidget(botao_fechar)
                
                # Criar um widget para conter os botões
                botoes_container = QWidget()
                botoes_container.setLayout(botoes_layout)
                botoes_container.setObjectName(f"botoes_perfil_{username}")  # Nome único para poder remover depois
                
                # Adicionar ao layout principal
                self.teste_login_botoes_layout.addWidget(botoes_container)
                
                # Atualizar mensagem de status
                self.teste_login_status_label.setText(f"Status: Aguardando login manual para {username}... (Navegador mantido aberto)")
            
            # Avisar o usuário que o navegador está aberto para login manual
            item = QListWidgetItem(f"{username}: ⚠️ Navegador mantido aberto para login manual")
            item.setData(Qt.UserRole, username)
            item.setForeground(QColor("orange"))
            self.teste_login_resultados_list.addItem(item)
            self.teste_login_resultados_list.scrollToBottom()
    
    def _verificar_login_manual(self, username):
        """Verifica se o usuário conseguiu fazer login manualmente no navegador aberto."""
        try:
            # Tentar obter o driver do navegador do perfil
            driver = self.dolphin_manager.get_profile_driver(username)
            if not driver:
                QMessageBox.warning(self, "Erro", f"Não foi possível acessar o navegador para {username}.")
                return
            
            # Verificar se está logado agora
            try:
                # Navegar para a página de edição de perfil para verificar login
                driver.get("https://www.instagram.com/accounts/edit/")
                time.sleep(3)  # Aguardar carregamento
                
                # Verificar se está na página de edição (confirma login bem-sucedido)
                if "accounts/edit" in driver.current_url.lower() and "accounts/login" not in driver.current_url.lower():
                    # Login manual bem-sucedido!
                    QMessageBox.information(self, "Sucesso", f"Login manual para {username} confirmado com sucesso!")
                    
                    # Atualizar status na tabela e na lista
                    for i in range(self.tabela_usuarios.rowCount()):
                        if self.tabela_usuarios.item(i, 0).text() == username:
                            status_item = self.tabela_usuarios.item(i, 2)
                            status_item.setText("ATIVO (Manual)")
                            status_item.setForeground(Qt.green)
                            break
                    
                    # Atualizar na lista de resultados
                    for i in range(self.teste_login_resultados_list.count()):
                        item = self.teste_login_resultados_list.item(i)
                        if item.data(Qt.UserRole) == username:
                            item.setText(f"{username}: ✅ Login manual confirmado com sucesso!")
                            item.setForeground(Qt.green)
                            break
                    
                    # Remover os botões deste perfil
                    botoes_container = self.findChild(QWidget, f"botoes_perfil_{username}")
                    if botoes_container:
                        botoes_container.deleteLater()
                    
                    # Incrementar contador de login bem-sucedido
                    self.logins_bem_sucedidos += 1
                    
                    # Fechar o navegador agora que o login está confirmado
                    self.dolphin_manager.close_profile_driver(username)
                    
                    # Salvar a tabela atualizada
                    self._salvar_lista_usuarios()
                    
                    # Atualizar status
                    self.teste_login_status_label.setText(f"Status: Login manual para {username} confirmado! Sucesso: {self.logins_bem_sucedidos} | Senhas Incorretas: {self.senhas_incorretas}")
                    
                    # Avançar para o próximo perfil
                    self.teste_login_indice_atual += 1
                    if self.teste_login_indice_atual < self.teste_login_total:
                        QTimer.singleShot(3000, self._testar_proxima_conta)
                    else:
                        QTimer.singleShot(1000, self._finalizar_teste_login)
                else:
                    # Ainda não está logado
                    QMessageBox.warning(self, "Login Pendente", f"Você ainda não está logado com {username}. Por favor, faça login manualmente no navegador aberto e tente verificar novamente.")
            except Exception as e:
                QMessageBox.warning(self, "Erro", f"Erro ao verificar login de {username}: {str(e)}")
        except Exception as e:
            QMessageBox.warning(self, "Erro", f"Erro ao verificar login manual: {str(e)}")
    
    def _fechar_e_pular_perfil(self, username):
        """Fecha o navegador e pula para o próximo perfil."""
        try:
            # Fechar o navegador deste perfil
            self.dolphin_manager.close_profile_driver(username)
            
            # Atualizar status na lista de resultados
            for i in range(self.teste_login_resultados_list.count()):
                item = self.teste_login_resultados_list.item(i)
                if item.data(Qt.UserRole) == username:
                    item.setText(f"{username}: ❌ Perfil pulado pelo usuário")
                    item.setForeground(Qt.red)
                    break
            
            # Remover os botões deste perfil
            botoes_container = self.findChild(QWidget, f"botoes_perfil_{username}")
            if botoes_container:
                botoes_container.deleteLater()
            
            # Avançar para o próximo perfil
            self.teste_login_indice_atual += 1
            if self.teste_login_indice_atual < self.teste_login_total:
                QTimer.singleShot(1000, self._testar_proxima_conta)
            else:
                QTimer.singleShot(500, self._finalizar_teste_login)
                
            # Atualizar status
            self.teste_login_status_label.setText(f"Status: Perfil {username} pulado. Sucesso: {self.logins_bem_sucedidos} | Senhas Incorretas: {self.senhas_incorretas}")
        except Exception as e:
            QMessageBox.warning(self, "Erro", f"Erro ao pular perfil {username}: {str(e)}")
    
    def _finalizar_teste_login(self, interrompido=False):
        """Finaliza o processo de teste de login e atualiza a interface."""
        self.teste_login_em_andamento = False
        if not interrompido:
            self.teste_login_status_label.setText("Status: Testes concluídos")
        
        self.iniciar_teste_login_button.setEnabled(True)
        
        # Mostrar resumo dos resultados
        total_testado = self.teste_login_indice_atual
        if total_testado > 0:
            # Adicionar os contadores no resumo do status
            mensagem = f"Testes concluídos: {total_testado}/{self.teste_login_total}\n"
            mensagem += f"Logins bem-sucedidos: {self.logins_bem_sucedidos}\n"
            mensagem += f"Senhas incorretas: {self.senhas_incorretas}\n"
            
            # Atualizar a barra de status também com os contadores
            self.teste_login_status_label.setText(f"Status: Concluído - Sucesso: {self.logins_bem_sucedidos} | Senhas Incorretas: {self.senhas_incorretas}")
            
            if interrompido:
                mensagem += "\nProcesso interrompido pelo usuário."
            
            QMessageBox.information(self, "Resumo dos Testes de Login", mensagem)

    def _atualizar_progresso_automacao(self, concluidas, total):
        """Atualiza o progresso da automação na interface."""
        self.progresso_automacao_label.setText(f"{concluidas}/{total} ações concluídas")
    
    def _toggle_comentario_input(self, state):
        """Habilita ou desabilita o campo de comentários com base no estado da checkbox."""
        self.comentario_input.setEnabled(state == Qt.Checked)
        if state == Qt.Checked:
            self.comentario_input.setFocus()
    
    def _on_acao_automacao_concluida(self, username, acao, sucesso, mensagem):
        """Chamado quando uma ação de automação é concluída."""
        # Podemos implementar lógica adicional aqui se necessário
        pass
    
    def _on_automacao_concluida(self):
        """Chamado quando toda a automação é concluída."""
        # Restaura a interface
        self.iniciar_automacao_button.setText("▶️ Iniciar Automação")
        self.iniciar_automacao_button.setStyleSheet("""
            QPushButton {
                background-color: #27ae60;
                color: white;
                padding: 8px;
                border-radius: 4px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #2ecc71;
            }
            QPushButton:disabled {
                background-color: #555;
                color: #888;
            }
        """)
        try:
            self.iniciar_automacao_button.clicked.disconnect()
        except TypeError:
            # Se não houver conexões para desconectar, apenas ignore o erro
            pass
        self.iniciar_automacao_button.clicked.connect(self._iniciar_automacao_acoes)
        self.iniciar_automacao_button.setEnabled(True)
        
        # Habilita os campos de configuração
        self._toggle_campos_automacao(True)
        
        # Atualiza a lista de perfis para refletir possíveis mudanças de status
        self._populate_profiles_list()
    
    def _toggle_campos_automacao(self, enabled):
        """Habilita ou desabilita os campos de configuração da automação."""
        self.post_url_input.setEnabled(enabled)
        self.acoes_spinbox.setEnabled(enabled)
        self.perfis_simult_spinbox.setEnabled(enabled)
        self.tempo_acoes_spinbox.setEnabled(enabled)
        self.curtir_checkbox.setEnabled(enabled)
        self.comentar_checkbox.setEnabled(enabled)
        self.comentario_input.setEnabled(enabled)
        
    @pyqtSlot(str, bool, str, str, str)
    def _on_dolphin_action_completed(self, username, success, final_status, message, original_action):
        """Manipula o evento de conclusão de ação do Dolphin."""
        self.status_text.append(f" Ação '{original_action}' para '{username}' concluída. Sucesso: {success}. Mensagem: {message}")
        
        # Atualiza a interface com base no status final
        if hasattr(self, 'atualizar_botoes_perfil'):
            # Atualiza os botões do perfil com base no novo status
            self.atualizar_botoes_perfil(username, final_status)
        
        # Se a ação for bem-sucedida, atualiza a lista de perfis (se necessário)
        if success and hasattr(self, '_populate_profiles_list'):
            self._populate_profiles_list()
# Fim da classe BotInterface
