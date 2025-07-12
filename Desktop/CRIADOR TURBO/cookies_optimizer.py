"""
Otimizador de Cookies para o Bot do Instagram
Este módulo otimiza o armazenamento de perfis extraindo apenas os cookies essenciais,
reduzindo drasticamente o espaço em disco usado.
"""
import os
import json
import time
import shutil
from selenium import webdriver

class CookiesOptimizer:
    """Classe para otimizar o armazenamento de cookies e sessões do Instagram."""
    
    def __init__(self, base_path=None, original_profiles_dir="dolphin_profiles", optimized_sessions_dir="sessions_otimizadas"):
        """Inicializa o otimizador de cookies.
        
        Args:
            base_path: Caminho base onde estão os diretórios
            original_profiles_dir: Diretório com os perfis originais do Dolphin Anty
            optimized_sessions_dir: Diretório onde serão salvas as sessões otimizadas
        """
        self.base_path = base_path if base_path else ""
        if original_profiles_dir:
            self.original_profiles_dir = os.path.join(self.base_path, original_profiles_dir)
        else:
            self.original_profiles_dir = None
        self.optimized_sessions_dir = os.path.join(self.base_path, optimized_sessions_dir)
        # Garantir que os diretórios existam
        if not os.path.exists(self.optimized_sessions_dir):
            os.makedirs(self.optimized_sessions_dir)
    
    def extrair_cookies_essenciais(self, driver):
        """Extrai apenas os cookies necessários para login no Instagram de um driver ativo.
        
        Args:
            driver: WebDriver do Selenium com uma sessão ativa do Instagram
            
        Returns:
            list: Lista de cookies essenciais
        """
        todos_cookies = driver.get_cookies()
        # Filtrar cookies relevantes (domínios do Instagram/Facebook)
        cookies_essenciais = [
            cookie for cookie in todos_cookies 
            if any(domain in cookie.get('domain', '') 
                  for domain in ['.instagram.com', 'instagram.com', '.facebook.com', 'facebook.com'])
        ]
        return cookies_essenciais
    
    def salvar_cookies(self, username, cookies):
        """Salva os cookies de um perfil em formato otimizado.
        
        Args:
            username: Nome do perfil
            cookies: Lista de cookies a serem salvos
            
        Returns:
            bool: True se salvo com sucesso, False caso contrário
        """
        try:
            # Salvar cookies em formato JSON diretamente na pasta sessions_otimizadas
            cookies_file = os.path.join(self.optimized_sessions_dir, f"{username}.json")
            with open(cookies_file, 'w', encoding='utf-8') as f:
                json.dump(cookies, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"[DEBUG] Erro ao salvar cookies otimizados para {username}: {e}")
            return False
    
    def carregar_cookies(self, username):
        """Carrega os cookies otimizados de um perfil.
        
        Args:
            username: Nome do perfil
            
        Returns:
            list or None: Lista de cookies ou None se não encontrado
        """
        try:
            cookies_file = os.path.join(self.optimized_sessions_dir, f"{username}.json")
            if os.path.exists(cookies_file):
                with open(cookies_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return None
        except Exception as e:
            print(f"[DEBUG] Erro ao carregar cookies otimizados para {username}: {e}")
            return None
    
    def restaurar_cookies_em_driver(self, driver, username):
        """Restaura os cookies otimizados em um driver.
        
        Args:
            driver: WebDriver do Selenium
            username: Nome do perfil
            
        Returns:
            bool: True se restaurado com sucesso, False caso contrário
        """
        try:
            cookies = self.carregar_cookies(username)
            if not cookies:
                print(f"[DEBUG] Cookies não encontrados para {username}")
                return False
                
            # Primeiro, ir para o domínio do Instagram para poder adicionar os cookies
            driver.get("https://www.instagram.com")
            time.sleep(1)
            
            # Adicionar cada cookie
            for cookie in cookies:
                # Garantir compatibilidade (alguns navegadores não aceitam 'expiry')
                if 'expiry' in cookie:
                    cookie['expiry'] = int(cookie['expiry'])
                try:
                    driver.add_cookie(cookie)
                except Exception as e:
                    print(f"[DEBUG] Erro ao adicionar cookie: {e}")
            
            # Recarregar após adicionar cookies para aplicá-los
            driver.refresh()
            time.sleep(2)
            
            # Verificar se os cookies foram aplicados e o login foi bem-sucedido
            if "instagram.com/accounts/login" in driver.current_url:
                print(f"[DEBUG] Falha na restauração dos cookies para {username} - ainda na página de login")
                return False
            
            return True
        except Exception as e:
            print(f"[DEBUG] Erro ao restaurar cookies para {username}: {e}")
            return False
    
    def iniciar_navegador_sem_perfil(self):
        """Inicia um navegador Chrome limpo, sem perfil pesado.
        
        Returns:
            WebDriver: Instância do Chrome WebDriver
        """
        options = webdriver.ChromeOptions()
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        
        # Diretório temporário para dados mínimos (não usar --user-data-dir)
        driver = webdriver.Chrome(options=options)
        driver.set_window_size(1280, 800)
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        return driver
    
    def iniciar_navegador_com_cookies(self, username):
        """Inicia um navegador Chrome e restaura os cookies do perfil.
        
        Args:
            username: Nome do perfil
            
        Returns:
            tuple: (WebDriver, success_status, message)
        """
        try:
            # Verificar se os cookies existem
            if not self.cookies_existem(username):
                return None, False, "Cookies otimizados não encontrados"
            
            # Iniciar navegador limpo
            driver = self.iniciar_navegador_sem_perfil()
            
            # Restaurar cookies
            if self.restaurar_cookies_em_driver(driver, username):
                # Verificar se o login está ativo
                driver.get("https://www.instagram.com/")
                time.sleep(2)
                
                # Se após navegar para o Instagram ainda estamos na página de login, falhou
                if "instagram.com/accounts/login" in driver.current_url:
                    driver.quit()
                    return None, False, "Falha na restauração de sessão"
                    
                return driver, True, "Sessão restaurada com sucesso"
            else:
                driver.quit()
                return None, False, "Falha ao restaurar cookies"
                
        except Exception as e:
            print(f"[DEBUG] Erro ao iniciar navegador com cookies para {username}: {e}")
            return None, False, f"Erro: {str(e)}"
    
    def cookies_existem(self, username):
        """Verifica se existem cookies otimizados para um perfil.
        
        Args:
            username: Nome do perfil
            
        Returns:
            bool: True se existem cookies, False caso contrário
        """
        cookies_file = os.path.join(self.optimized_sessions_dir, f"{username}.json")
        return os.path.exists(cookies_file)
    
    def otimizar_perfil_existente(self, profile_name, dolphin_manager):
        """Extrai cookies de um perfil Dolphin existente e salva em formato otimizado.
        
        Args:
            profile_name: Nome do perfil
            dolphin_manager: Instância do DolphinAntyManager
            
        Returns:
            tuple: (success, message)
        """
        try:
            # Verificar se o perfil existe
            profile_dir = os.path.join(self.original_profiles_dir, profile_name)
            if not os.path.exists(profile_dir):
                return False, "Perfil não encontrado"
            
            # Lançar o perfil
            success, message = dolphin_manager.launch_profile_instagram(profile_name)
            if not success:
                return False, f"Falha ao iniciar perfil: {message}"
            
            # Obter o driver
            driver = dolphin_manager.get_profile_driver(profile_name)
            if not driver:
                return False, "Driver não disponível"
            
            # Acessar Instagram antes de extrair cookies
            driver.get("https://www.instagram.com/")
            time.sleep(5)  # Aguarda o carregamento da página

            # Verificar se está logado (simples: se está na página de login)
            if "instagram.com/accounts/login" in driver.current_url:
                print(f"[INFO] Tentando login automático no Instagram para {profile_name}...")
                # Buscar usuário e senha no all_profiles_metadata.json
                try:
                    import json
                    metadata_path = os.path.join(self.original_profiles_dir, "all_profiles_metadata.json")
                    with open(metadata_path, 'r', encoding='utf-8') as f:
                        all_metadata = json.load(f)
                    if profile_name in all_metadata:
                        username = all_metadata[profile_name]['username']
                        password = all_metadata[profile_name]['password']
                        # Tentar login automático usando o método do manager
                        success, msg = dolphin_manager.attempt_login_instagram(driver, username, password)
                        print(f"[INFO] Resultado do login automático: {msg}")
                        if not success:
                            print("[ATENÇÃO] Login automático falhou. Faça login manualmente nesta janela, depois pressione ENTER aqui.")
                            input("Após concluir o login e ver seu feed, pressione ENTER aqui para continuar...")
                            time.sleep(2)
                        else:
                            # Aguarda o feed carregar
                            import time
                            time.sleep(5)
                    else:
                        print("[ATENÇÃO] Usuário não encontrado no all_profiles_metadata.json. Faça login manualmente e pressione ENTER aqui.")
                        input("Após concluir o login e ver seu feed, pressione ENTER aqui para continuar...")
                        time.sleep(2)
                except Exception as e:
                    print(f"[ERRO] Falha ao buscar credenciais para login automático: {e}. Faça login manualmente e pressione ENTER aqui.")
                    input("Após concluir o login e ver seu feed, pressione ENTER aqui para continuar...")
                    time.sleep(2)

            # Extrair cookies
            cookies = self.extrair_cookies_essenciais(driver)
            if not cookies:
                driver.quit()
                return False, "Nenhum cookie extraído"
            
            # Salvar cookies
            if self.salvar_cookies(profile_name, cookies):
                print(f"[DEBUG] Perfil {profile_name} otimizado com sucesso: {len(cookies)} cookies salvos")
                
                # Fechar o driver
                try:
                    driver.quit()
                except:
                    pass
                    
                return True, f"{len(cookies)} cookies extraídos e salvos"
            else:
                driver.quit()
                return False, "Falha ao salvar cookies"
                
        except Exception as e:
            print(f"[DEBUG] Erro ao otimizar perfil {profile_name}: {e}")
            return False, f"Erro: {str(e)}"
    
    def limpar_cache_dolphin(self, preservar_dias=7):
        """Limpa diretórios de cache dos perfis Dolphin Anty.
        
        Args:
            preservar_dias: Não limpar perfis acessados nos últimos X dias
            
        Returns:
            tuple: (total_profiles, cleaned_profiles, saved_space)
        """
        try:
            total_profiles = 0
            cleaned_profiles = 0
            bytes_liberados = 0
            
            # Tempo mínimo para preservar (em segundos)
            tempo_min = time.time() - (preservar_dias * 24 * 60 * 60)
            
            for profile_name in os.listdir(self.original_profiles_dir):
                profile_dir = os.path.join(self.original_profiles_dir, profile_name)
                if not os.path.isdir(profile_dir) or profile_name == "all_profiles_metadata.json":
                    continue
                    
                total_profiles += 1
                
                # Verificar se o perfil foi acessado recentemente
                metadata_file = os.path.join(profile_dir, "metadata.json")
                skip_clean = False
                
                if os.path.exists(metadata_file):
                    try:
                        # Verificar última atualização do arquivo de metadados
                        mod_time = os.path.getmtime(metadata_file)
                        if mod_time > tempo_min:
                            skip_clean = True
                    except:
                        pass
                
                if skip_clean:
                    continue
                
                # Lista de diretórios que contêm cache e podem ser limpos
                cache_dirs = [
                    'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 
                    'Service Worker', 'Session Storage', 'CacheStorage',
                    'IndexedDB', 'blob_storage'
                ]
                
                # Lista de arquivos que podem ser limpos
                cache_files = [
                    'Cookies-journal', 'History-journal', 'Network Action Predictor',
                    'Visited Links', 'Network Persistent State', 'QuotaManager',
                    'Extension State', 'Extension Rules', 'Last Session', 'Last Tabs'
                ]
                
                # Limpar diretórios de cache
                for cache_dir in cache_dirs:
                    dir_path = os.path.join(profile_dir, cache_dir)
                    if os.path.exists(dir_path):
                        # Calcular tamanho antes de remover
                        dir_size = self._get_dir_size(dir_path)
                        bytes_liberados += dir_size
                        
                        # Remover diretório
                        shutil.rmtree(dir_path, ignore_errors=True)
                
                # Limpar arquivos de cache
                for cache_file in cache_files:
                    file_path = os.path.join(profile_dir, cache_file)
                    if os.path.exists(file_path):
                        bytes_liberados += os.path.getsize(file_path)
                        os.remove(file_path)
                
                cleaned_profiles += 1
                
            # Converter bytes para MB ou GB para facilitar leitura
            saved_space = bytes_liberados
            if saved_space > 1024 * 1024 * 1024:
                saved_space_str = f"{saved_space / (1024 * 1024 * 1024):.2f} GB"
            else:
                saved_space_str = f"{saved_space / (1024 * 1024):.2f} MB"
                
            return total_profiles, cleaned_profiles, saved_space_str
                
        except Exception as e:
            print(f"[DEBUG] Erro ao limpar cache: {e}")
            return 0, 0, "0 MB"
    
    def _get_dir_size(self, path):
        """Calcula o tamanho total de um diretório recursivamente."""
        total_size = 0
        for dirpath, dirnames, filenames in os.walk(path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                try:
                    total_size += os.path.getsize(fp)
                except:
                    pass
        return total_size
    
    def remover_perfis_otimizados_invalidos(self):
        """Remove perfis otimizados que não têm cookies válidos."""
        removidos = 0
        
        try:
            for filename in os.listdir(self.optimized_sessions_dir):
                if not filename.endswith('.json'):
                    continue
                cookies_file = os.path.join(self.optimized_sessions_dir, filename)
                # Se o arquivo não for válido (ex: corrompido), remove
                try:
                    with open(cookies_file, 'r', encoding='utf-8') as f:
                        json.load(f)
                except Exception:
                    os.remove(cookies_file)
                    removidos += 1
        except Exception as e:
            print(f"[DEBUG] Erro ao remover perfis inválidos: {e}")
            
        return removidos
