"""
DolphinAntyManager Otimizado - Versão com armazenamento eficiente de cookies.
Esta versão trabalha com o otimizador de cookies para reduzir drasticamente 
o tamanho da pasta de perfis.
"""
import os
import shutil
import time
import json
import random
import string
from PyQt5.QtCore import QThread, pyqtSignal
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException, NoSuchElementException

from cookies_optimizer import CookiesOptimizer

class DirectoryRemoverWorker(QThread):
    """Worker para remover diretórios em background, evitando bloqueio da interface."""
    removal_completed = pyqtSignal(str, bool)  # Sinal para informar quando a remoção for concluída (perfil, sucesso)
    
    def __init__(self, directory_path, profile_name):
        super().__init__()
        self.directory_path = directory_path
        self.profile_name = profile_name
    
    def run(self):
        """Remove um diretório em uma thread separada"""
        try:
            print(f"[DEBUG] Worker: Removendo diretório do perfil com erro: {self.profile_name}")
            # Aguarda um momento para garantir que outros processos tenham liberado o diretório
            time.sleep(0.5)
            # Remove o diretório recursivamente
            shutil.rmtree(self.directory_path, ignore_errors=True)
            # Verifica se a remoção foi bem-sucedida
            success = not os.path.exists(self.directory_path)
            # Emite o sinal com o resultado
            self.removal_completed.emit(self.profile_name, success)
        except Exception as e:
            print(f"[DEBUG] Worker: Erro ao remover diretório {self.directory_path}: {e}")
            self.removal_completed.emit(self.profile_name, False)

class DolphinAntyOptimizedManager:
    """Versão otimizada do gerenciador Dolphin Anty que usa cookies em vez de perfis inteiros."""

    def add_profile_metadata(self, username, email, password, browser_type):
        """Adiciona um novo perfil ao arquivo all_profiles_metadata.json."""
        # Salvar metadados apenas em sessions_otimizadas
        all_metadata_file = os.path.join(self.optimized_sessions_dir, "all_profiles_metadata.json")
        if os.path.exists(all_metadata_file):
            with open(all_metadata_file, "r", encoding="utf-8") as f:
                try:
                    all_metadata = json.load(f)
                except Exception:
                    all_metadata = {}
        else:
            all_metadata = {}

        if username in all_metadata:
            raise Exception(f"O perfil '{username}' já existe!")

        now_str = time.strftime("%Y-%m-%d %H:%M:%S")
        all_metadata[username] = {
            "username": username,
            "email": email,
            "password": password,
            "browser_type": browser_type,
            "bot_login_status": "desconectado",
            "created_at": now_str,
            "last_update": now_str
        }

        with open(all_metadata_file, "w", encoding="utf-8") as f:
            json.dump(all_metadata, f, indent=4, ensure_ascii=False)

    
    def __init__(self, base_bot_path=None, profiles_dir="dolphin_profiles", optimized_sessions_dir="sessions_otimizadas", browser_type="chrome"):
        """Inicializa o gerenciador otimizado de perfis do Dolphin Anty.
        
        Args:
            base_bot_path: Caminho base do bot
            profiles_dir: Diretório para os perfis originais (legado)
            optimized_sessions_dir: Diretório para as sessões otimizadas
            browser_type: Tipo de navegador (chrome, edge, etc.)
        """
        self.base_bot_path = base_bot_path
        self.optimized_sessions_dir = optimized_sessions_dir
        
        if base_bot_path:
            # Combinar base_bot_path com os diretórios se não forem caminhos absolutos
            self.optimized_sessions_dir = os.path.join(base_bot_path, optimized_sessions_dir)
        else:
            self.optimized_sessions_dir = optimized_sessions_dir
        
        if not os.path.exists(self.optimized_sessions_dir):
            os.makedirs(self.optimized_sessions_dir)
        # Nunca criar ou usar self.profiles_dir nem dolphin_profiles
        self.cookies_optimizer = CookiesOptimizer(
            base_path=base_bot_path,
            original_profiles_dir=None,  # Não usar mais dolphin_profiles
            optimized_sessions_dir=optimized_sessions_dir
        )
        
        self.browser_type = browser_type
        self.profile_drivers = {}
        
    def get_profile_driver(self, profile_name):
        """Retorna o driver do navegador para um perfil específico, se estiver ativo.
        
        Args:
            profile_name (str): Nome do perfil para o qual obter o driver
            
        Returns:
            WebDriver or None: O driver do navegador se estiver ativo, ou None caso contrário
        """
        if profile_name in self.profile_drivers:
            driver = self.profile_drivers[profile_name]
            try:
                # Verifica se o driver ainda é válido tentando acessar uma propriedade
                _ = driver.current_url  # Isso vai lançar uma exceção se o driver não estiver mais ativo
                return driver
            except Exception as e:
                print(f"[DEBUG] Driver para {profile_name} não está mais válido: {e}")
                # Remove a referência ao driver inválido
                self.profile_drivers[profile_name] = None
                return None
        return None
        
    def get_profile_metadata(self, profile_name):
        """Obtém os metadados de um perfil.
        
        Args:
            profile_name: Nome do perfil
            
        Returns:
            dict: Metadados do perfil
        """
        # Primeiro verificar sessão otimizada
        otimizado_metadata_path = os.path.join(self.optimized_sessions_dir, profile_name, "metadata.json")
        if os.path.exists(otimizado_metadata_path):
            try:
                with open(otimizado_metadata_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"[DEBUG] Erro ao ler metadados otimizados para {profile_name}: {e}")
        
        # Caso não encontre, buscar no sistema legado
        # Verificar arquivo centralizado
        all_metadata_file = os.path.join(self.profiles_dir, "all_profiles_metadata.json")
        if os.path.exists(all_metadata_file):
            try:
                with open(all_metadata_file, 'r', encoding='utf-8') as f:
                    all_metadata = json.load(f)
                    if isinstance(all_metadata, dict) and profile_name in all_metadata:
                        return all_metadata[profile_name]
            except Exception as e:
                print(f"[DEBUG] Erro ao ler metadados do arquivo centralizado: {e}")
        
        # Verificar arquivo individual (para compatibilidade)
        old_metadata_file = os.path.join(self.profiles_dir, profile_name, "metadata.json")
        if os.path.exists(old_metadata_file):
            try:
                with open(old_metadata_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"[DEBUG] Erro ao ler metadados do arquivo individual: {e}")
                
        # Se não encontrar nada, retornar dicionário vazio
        return {}
        
    def update_profile_bot_login_status(self, profile_name, status, message=None):
        """Atualiza o status de login de um perfil específico.
        
        Args:
            profile_name (str): Nome do perfil a ser atualizado
            status (str): Status atual do perfil ('logando', 'success', 'failed', etc)
            message (str, optional): Mensagem adicional sobre o status
        
        Returns:
            bool: True se a atualização foi bem-sucedida, False caso contrário
        """
        try:
            # Obter o caminho do arquivo de metadados
            metadata_path = os.path.join(self.optimized_sessions_dir, profile_name, "metadata.json")
            metadata = {}
            
            # Carregar metadados existentes se o arquivo existir
            if os.path.exists(metadata_path):
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
            
            # Atualizar o status de login
            metadata['login_status'] = status
            metadata['last_login_attempt'] = time.time()
            if message:
                metadata['status_message'] = message
            
            # Criar o diretório se não existir
            os.makedirs(os.path.dirname(metadata_path), exist_ok=True)
            
            # Salvar os metadados atualizados
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=4)
            
            return True
            
        except Exception as e:
            print(f"[DEBUG] Erro ao atualizar status de login para {profile_name}: {e}")
            return False
            
    def get_all_profiles_metadata(self):
        """Retorna um dicionário com metadados de todos os perfis.
        
        Returns:
            dict: Dicionário com nome do perfil como chave e metadados como valor
        """
        all_metadata = {}
        
        # Verificar arquivo centralizado de metadados legado
        all_metadata_file = os.path.join(self.optimized_sessions_dir, "all_profiles_metadata.json")
        if os.path.exists(all_metadata_file):
            try:
                with open(all_metadata_file, 'r', encoding='utf-8') as f:
                    all_metadata = json.load(f)
                    if not isinstance(all_metadata, dict):
                        all_metadata = {}
            except Exception as e:
                print(f"[DEBUG] Erro ao ler metadados centralizados: {e}")
        
        # Adicionar perfis otimizados
        if os.path.exists(self.optimized_sessions_dir):
            for filename in os.listdir(self.optimized_sessions_dir):
                if filename.endswith('.json') and filename != "all_profiles_metadata.json":
                    profile_name = filename[:-5]
                    # Se já existe no all_metadata, pula
                    if profile_name in all_metadata:
                        continue
                    try:
                        with open(os.path.join(self.optimized_sessions_dir, filename), 'r', encoding='utf-8') as f:
                            cookies = json.load(f)
                            # Marcar que é perfil otimizado
                            all_metadata[profile_name] = {
                                'username': profile_name,
                                'optimized': True,
                                'cookies_file': filename,
                                'cookies_count': len(cookies)
                            }
                    except Exception as e:
                        print(f"[DEBUG] Erro ao ler cookies otimizados para {profile_name}: {e}")
        
        return all_metadata
        
    def launch_profile_instagram(self, profile_name, go_to_instagram_home=True):
        """Lança um perfil otimizado no Instagram.
        
        Primeiro tenta usar a sessão otimizada (cookies). Se não encontrar ou se falhar,
        utiliza o método legado e depois otimiza a sessão.
        
        Args:
            profile_name: Nome do perfil para lançar
            go_to_instagram_home: Se True, navegador irá para a página inicial do Instagram
            
        Returns:
            tuple: (success, message) ou (driver, success, message)
        """
        print(f"[DEBUG] Iniciando lançamento otimizado do perfil {profile_name}")
        
        # Verificar se já existe um driver ativo para esse perfil
        if profile_name in self.profile_drivers and self.profile_drivers[profile_name]:
            try:
                driver = self.profile_drivers[profile_name]
                current_url = driver.current_url
                print(f"[DEBUG] Perfil {profile_name} já está em execução. URL atual: {current_url}")
                
                # Se go_to_instagram_home for True, navegar para o Instagram mesmo que já esteja aberto
                if go_to_instagram_home:
                    print(f"[DEBUG] Redirecionando perfil existente para Instagram")
                    driver.get("https://www.instagram.com/")
                
                return True, "Perfil já está em execução."
            except Exception as e:
                print(f"[DEBUG] Driver para {profile_name} inválido, recriando: {e}")
                # Garantir que o driver inválido seja fechado e removido
                self.close_profile_driver(profile_name)
        
        # Verificar se o perfil tem sessão otimizada
        if self.cookies_optimizer.cookies_existem(profile_name):
            print(f"[DEBUG] Encontrada sessão otimizada para {profile_name}, tentando usar")
            
            # Iniciar navegador com cookies otimizados
            driver, success, message = self.cookies_optimizer.iniciar_navegador_com_cookies(profile_name)
            
            if success:
                # Sessão restaurada com sucesso
                print(f"[DEBUG] Sessão otimizada restaurada com sucesso para {profile_name}")
                
                # Ir para a página inicial do Instagram se solicitado
                if go_to_instagram_home:
                    driver.get("https://www.instagram.com/")
                
                # Registrar driver
                self.profile_drivers[profile_name] = driver
                return True, "Sessão otimizada restaurada com sucesso"
            else:
                print(f"[DEBUG] Falha ao restaurar sessão otimizada: {message}, tentando método legado")
        else:
            print(f"[DEBUG] Não encontrada sessão otimizada para {profile_name}, usando método legado")
            
        # Se chegou aqui, não encontrou sessão otimizada ou falhou ao restaurar
        # Tentar com o método legado
        
        # Obter diretório do perfil
        profile_dir = os.path.join(self.profiles_dir, profile_name)
        
        # Verificar se já existe um perfil e criar se não existir
        if not os.path.exists(profile_dir):
            print(f"[DEBUG] Perfil {profile_name} ainda não tem diretório. Criando automaticamente...")
            try:
                os.makedirs(profile_dir)
                print(f"[DEBUG] Diretório para {profile_name} criado com sucesso em: {profile_dir}")
                
                # Inicializar os metadados mínimos para o diretório
                metadata = {
                    "username": profile_name,
                    "login_status": "desconectado",
                    "last_access": time.strftime("%Y-%m-%d %H:%M:%S")
                }
                
                # Salvar metadados
                with open(os.path.join(profile_dir, "metadata.json"), 'w', encoding='utf-8') as f:
                    json.dump(metadata, f, ensure_ascii=False, indent=4)
            except Exception as e:
                print(f"[DEBUG] Erro ao criar diretório para {profile_name}: {str(e)}")
                return False, f"Erro ao criar diretório do perfil: {str(e)}"
        
        try:
            # Configurar o driver do Chrome
            options = ChromeOptions()
            options.add_argument(f"--user-data-dir={profile_dir}")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option('useAutomationExtension', False)
            
            # Debug: imprimir informações sobre o perfil
            print(f"[DEBUG] Iniciando Chrome com perfil legado em: {profile_dir}")
            
            try:
                # Criar o driver
                driver = webdriver.Chrome(options=options)
                print(f"[DEBUG] Driver para {profile_name} criado com sucesso")
                # Sempre navega para o Instagram ao abrir o driver
                driver.get("https://www.instagram.com/")
                time.sleep(2)
            except Exception as driver_error:
                print(f"[DEBUG] Erro ao criar driver Chrome: {driver_error}")
                return False, f"Erro ao criar driver: {str(driver_error)}"
            
            # Configurações adicionais
            driver.set_window_size(1280, 800)
            driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            
            # Armazenar o driver para uso posterior
            self.profile_drivers[profile_name] = driver
            
            # Não precisa de outro get, já está no Instagram
            return True, "Perfil iniciado com sucesso usando método legado."
            
        except Exception as e:
            print(f"[DEBUG] Erro ao lançar perfil {profile_name}: {str(e)}")
            return False, f"Erro ao lançar perfil: {str(e)}"
    
    def is_logged_in(self, driver):
        """Verifica se o perfil está logado no Instagram.
        
        Args:
            driver: WebDriver do Selenium
            
        Returns:
            bool: True se estiver logado, False caso contrário
        """
        try:
            # Se estamos na página de login, não estamos logados
            if "instagram.com/accounts/login" in driver.current_url:
                return False
                
            # Verificar elementos que só aparecem quando logado
            try:
                # Elementos que indicam que o usuário está logado
                seletores_logado = [
                    "//a[contains(@href, '/direct/inbox')]",  # Link para mensagens diretas
                    "//span[contains(@class, 'x1lliihq')]//*[local-name()='svg' and @aria-label='Direct']",  # Ícone do Direct
                    "//span[contains(@class, 'x1lliihq')]//*[local-name()='svg' and @aria-label='Página inicial']",  # Ícone Home
                    "//div[contains(@class, 'x1iyjqo2')]//span[contains(@class, 'x1lliihq')]//*[local-name()='svg']",  # Qualquer ícone do menu principal
                    "//span[@role='link' and contains(@class, 'x1lliihq')]"  # Links do menu principal
                ]
                
                for seletor in seletores_logado:
                    elementos = driver.find_elements(By.XPATH, seletor)
                    if elementos and any(elem.is_displayed() for elem in elementos):
                        return True
                
                # Se não encontrou nenhum dos elementos acima, verificar mais elementos
                # Verificar botão de post/novo
                post_button = driver.find_elements(By.XPATH, "//div[contains(@class, '_aagw')]")
                if post_button and any(elem.is_displayed() for elem in post_button):
                    return True
                    
                # Verificar barra superior (que só aparece para usuários logados)
                top_bar = driver.find_elements(By.XPATH, "//div[contains(@class, 'x1qjc9v5') and contains(@class, 'x9f619')]")
                if top_bar and any(elem.is_displayed() for elem in top_bar):
                    return True
                
                # Se chegou aqui, não encontrou evidências de login
                return False
                
            except Exception as e:
                print(f"[DEBUG] Erro ao verificar elementos de login: {e}")
                return False
        except Exception as e:
            print(f"[DEBUG] Erro ao verificar login: {e}")
            return False
    
    def close_profile_driver(self, profile_name):
        """Fecha o driver de um perfil específico.
        
        Args:
            profile_name: Nome do perfil
            
        Returns:
            bool: True se fechado com sucesso, False caso contrário
        """
        try:
            if profile_name in self.profile_drivers and self.profile_drivers[profile_name]:
                driver = self.profile_drivers[profile_name]
                driver.quit()
                self.profile_drivers[profile_name] = None
                return True
            return False
        except Exception as e:
            print(f"[DEBUG] Erro ao fechar driver do perfil {profile_name}: {e}")
            self.profile_drivers[profile_name] = None
            return False
    
    def attempt_login_instagram(self, driver, username, password, max_retries=2):
        """Tenta fazer login no Instagram.
        
        Args:
            driver: WebDriver do Selenium
            username: Nome de usuário do Instagram
            password: Senha do Instagram
            max_retries: Número máximo de tentativas
            
        Returns:
            tuple: (success, message)
        """
        try:
            # Verificar se já está logado
            if self.is_logged_in(driver):
                print(f"[DEBUG] Usuário já está logado!")
                # Verificar se está ativo indo para a página de edição
                driver.get("https://www.instagram.com/accounts/edit/")
                time.sleep(1)  # Reduzido para 1 segundo
                if "accounts/edit" in driver.current_url.lower():
                    print(f"[DEBUG] Usuário está ATIVO!")
                    return True, "Já está logado e ATIVO"
                return True, "Já está logado"
            
            # Garantir que estamos na página de login
            if "instagram.com/accounts/login" not in driver.current_url:
                driver.get("https://www.instagram.com/accounts/login/")
                time.sleep(1)
            
            # Tentar fazer login
            for tentativa in range(max_retries):
                try:
                    # Limpar campos e inserir credenciais
                    username_field = driver.find_element(By.NAME, "username")
                    password_field = driver.find_element(By.NAME, "password")
                    
                    username_field.clear()
                    password_field.clear()
                    
                    username_field.send_keys(username)
                    password_field.send_keys(password)
                    
                    # Clicar no botão de login
                    login_button = driver.find_element(By.XPATH, "//button[@type='submit']")
                    login_button.click()
                    
                    # Aguardar um pouco para o login processar
                    time.sleep(3)
                    
                    # Verificar se a conta está suspensa
                    if "instagram.com/accounts/suspended" in driver.current_url.lower():
                        print(f"[DEBUG] Conta {username} está suspensa!")
                        return False, "SUSPENSA"

                    # Verificar se o login foi bem-sucedido
                    if self.is_logged_in(driver):
                        print(f"[DEBUG] Login bem-sucedido para {username}")
                        # Otimizar o perfil após login bem-sucedido
                        self._otimizar_perfil_apos_login(driver, username)
                        
                        # Verificar se está ativo indo para a página de edição
                        driver.get("https://www.instagram.com/accounts/edit/")
                        time.sleep(1)  # Reduzido para 1 segundo
                        if "accounts/edit" in driver.current_url.lower():
                            print(f"[DEBUG] Usuário está ATIVO!")
                            return True, "Login bem-sucedido e ATIVO"
                        return True, "Login bem-sucedido"
                    
                    # Verificar mensagens de erro
                    error_messages = driver.find_elements(By.XPATH, "//p[@class='_ab2z']")
                    for error in error_messages:
                        if error.is_displayed():
                            error_text = error.text.lower()
                            if "incorrect" in error_text or "senha" in error_text:
                                return False, "Senha incorreta"
                            elif "challenge" in error_text:
                                return False, "Requer verificação"
                            else:
                                return False, f"Erro de login: {error_text}"
                    
                    time.sleep(1)
                    
                except Exception as e:
                    print(f"[DEBUG] Erro na tentativa {tentativa + 1} de login: {str(e)}")
                    if tentativa < max_retries - 1:
                        time.sleep(1)
                        continue
                    else:
                        return False, f"Erro ao tentar login: {str(e)}"
            
            return False, "Falha no login após várias tentativas"
            
        except Exception as e:
            print(f"[DEBUG] Erro no processo de login: {str(e)}")
            return False, f"Erro no processo de login: {str(e)}"
    
    def _otimizar_perfil_apos_login(self, driver, username):
        """Otimiza um perfil após login bem-sucedido extraindo e salvando cookies.
        
        Args:
            driver: WebDriver do Selenium com login ativo
            username: Nome do perfil
        """
        try:
            print(f"[DEBUG] Otimizando perfil {username} após login bem-sucedido")
            
            # Extrair cookies
            cookies = self.cookies_optimizer.extrair_cookies_essenciais(driver)
            if cookies:
                # Salvar cookies
                if self.cookies_optimizer.salvar_cookies(username, cookies):
                    print(f"[DEBUG] Perfil {username} otimizado com sucesso: {len(cookies)} cookies salvos")
                    return True
                else:
                    print(f"[DEBUG] Falha ao salvar cookies para {username}")
            else:
                print(f"[DEBUG] Nenhum cookie extraído para {username}")
            
            return False
        except Exception as e:
            print(f"[DEBUG] Erro ao otimizar perfil após login: {e}")
            return False
    
    def limpar_cache_perfis(self, preservar_dias=7):
        """Não há mais cache de perfis para limpar, apenas arquivos .json de cookies."""
        return 0, 0, "0 MB"
    
    def otimizar_perfil_existente(self, profile_name):
        """Otimiza um perfil existente extraindo apenas os cookies essenciais.
        
        Args:
            profile_name: Nome do perfil
            
        Returns:
            tuple: (success, message)
        """
        return self.cookies_optimizer.otimizar_perfil_existente(profile_name, self)
    
    def otimizar_todos_perfis(self):
        """Otimiza todos os perfis existentes.
        Agora não faz nada, pois não existem mais perfis completos, apenas arquivos .json de cookies.
        """
        return 0, 0, 0, ["Nenhum perfil completo para otimizar. Apenas arquivos .json são utilizados."]
        
    def close_all_managed_drivers(self):
        """Fecha todos os drivers de navegador gerenciados pelo Dolphin Anty.
        
        Returns:
            int: Número de drivers fechados
        """
        fechados = 0
        print(f"[DEBUG] Fechando todos os drivers gerenciados pelo Dolphin Anty...")
        try:
            all_profiles = self.get_all_profiles_metadata()
            for profile_name in all_profiles:
                if self.close_profile_driver(profile_name):
                    fechados += 1
            print(f"[DEBUG] {fechados} drivers fechados com sucesso")
            return fechados
        except Exception as e:
            print(f"[DEBUG] Erro ao fechar todos os drivers: {e}")
            return fechados
