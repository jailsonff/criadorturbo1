import sys
import random
import time
import imaplib
import email
from datetime import datetime, timedelta
from pytz import timezone, utc
import re
import os

from PyQt5.QtCore import QThread, pyqtSignal, QMutex, QWaitCondition, pyqtSlot
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.firefox.options import Options as FirefoxOptions
# Se precisar especificar o caminho do driver ou usar o Service:
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException,
    NoSuchElementException,
    ElementNotInteractableException,
    StaleElementReferenceException,
    ElementClickInterceptedException
)

from cookies_optimizer import CookiesOptimizer

class Worker(QThread):
    finished = pyqtSignal(str)
    status = pyqtSignal(str)
    codigo_manual_necessario = pyqtSignal(str)

    """
        Initialize a Worker thread for Instagram bot account creation and management.

        Args:
            dados_conta_completa (dict): A dictionary containing complete account details including:
                - email (str): Account email
                - username (str): Instagram username
                - password (str): Account password
                - data_nascimento (str): Date of birth
                - intervalo_email (int): Email check interval
                - ativar_foto_perfil (bool, optional): Whether to activate profile picture
                - caminho_foto (str, optional): Path to profile picture
                - ativar_bio (bool, optional): Whether to activate bio
                - config_bio (dict, optional): Bio configuration
                - ativar_posts (bool, optional): Whether to activate posts
                - config_posts (dict, optional): Posts configuration
                - consultar_email_auto (bool, optional): Whether to automatically check email
                - codigo_manual (str, optional): Manual verification code

            parent_interface (QWidget, optional): Parent Qt widget for the thread
        """
    def __init__(self, dados_conta_completa, parent_interface=None, dolphin_manager=None):
        super().__init__(parent_interface)
        self.dados_conta = dados_conta_completa
        self.dolphin_manager = dolphin_manager # Armazena a instância do DolphinAntyManager

        self.email_conta = dados_conta_completa['email']
        self.username = dados_conta_completa['username']
        self.password = dados_conta_completa['password']
        self.data_nascimento = dados_conta_completa['data_nascimento']
        self.intervalo_email_check = dados_conta_completa['intervalo_email']

        self.ativar_foto_perfil = dados_conta_completa.get('ativar_foto_perfil', False)
        self.caminho_foto_perfil = dados_conta_completa['caminho_foto'] if self.ativar_foto_perfil else None

        self.ativar_bio = dados_conta_completa.get('ativar_bio', False)
        self.config_bio = dados_conta_completa.get('config_bio', {}) if self.ativar_bio else {}

        self.ativar_posts = dados_conta_completa.get('ativar_posts', False)
        self.config_posts = dados_conta_completa.get('config_posts', {}) if self.ativar_posts else {}

        self.consultar_email_auto = dados_conta_completa.get('consultar_email_auto', True)
        self.codigo_manual = dados_conta_completa.get('codigo_manual', '')
        self.navegador_escolhido = dados_conta_completa.get('navegador_escolhido', 'Chrome') # Recebe o navegador
        self.user_data_dir = dados_conta_completa.get('user_data_dir') # Recebe o user_data_dir para o perfil

        self._stop = False
        self.driver = None

        self.cookies_optimizer = CookiesOptimizer()

        self.mutex = QMutex()
        self.condition = QWaitCondition()
        self.codigo_recebido_manualmente = None
        self._paused = False

    def stop(self):
        self.status.emit(f" Tentando parar o processo para {self.username}...")
        self._stop = True
        self.resume()

    @pyqtSlot(str)
    def resume(self, codigo=None):
        self.mutex.lock()
        self._paused = False
        if codigo:
            self.codigo_recebido_manualmente = codigo
        self.condition.wakeAll()
        self.mutex.unlock()

    def get_parent_interface(self):
        return self.parent()

    def _remover_emojis(self, text):
        if not text:
            return ""
        emoji_pattern = re.compile(
            "["
            u"\U0001F600-\U0001F64F"  # emoticons
            u"\U0001F300-\U0001F5FF"  # symbols & pictographs
            u"\U0001F680-\U0001F6FF"  # transport & map symbols
            u"\U0001F700-\U0001F77F"  # alchemical symbols
            u"\U0001F780-\U0001F7FF"  # Geometric Shapes Extended
            u"\U0001F800-\U0001F8FF"  # Supplemental Arrows-C
            u"\U0001F900-\U0001F9FF"  # Supplemental Symbols and Pictographs
            u"\U0001FA00-\U0001FA6F"  # Chess Symbols
            u"\U0001FA70-\U0001FAFF"  # Symbols and Pictographs Extended-A
            u"\U00002702-\U000027B0"  # Dingbats
            u"\U000024C2-\U0001F251"
            "]+", flags=re.UNICODE)
        texto_limpo = emoji_pattern.sub(r'', text)
        texto_limpo = "".join(char for char in texto_limpo if ord(char) < 128 or char.isspace() or char in "áéíóúâêîôûàãõçÁÉÍÓÚÂÊÎÔÛÀÃÕÇ,.-_")
        return texto_limpo.strip()


    def _salvar_conta_criada(self):
        """Salva os dados da conta criada com sucesso em contas_criadas.txt."""
        try:
            if hasattr(sys, '_MEIPASS'):
                script_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
            else:
                script_dir = os.path.dirname(os.path.abspath(sys.argv[0]))

            file_path = os.path.join(script_dir, "contas_criadas.txt")

            with open(file_path, "a", encoding="utf-8") as f:
                f.write(f"Email: {self.email_conta}, Usuário: {self.username}, Senha: {self.password}\n")
            self.status.emit(f" Dados da conta {self.username} salvos em {file_path}")

            # Adiciona metadados ao DolphinAntyManager
            if self.dolphin_manager:
                try:
                    # Como o run foi modificado para usar sempre Chrome, passamos "Chrome" aqui.
                    self.dolphin_manager.add_profile_metadata(self.username, self.email_conta, self.password, "Chrome")
                    self.status.emit(f" Metadados de {self.username} (Chrome) adicionados ao Dolphin Anty Manager.")
                except Exception as e_dolphin:
                    self.status.emit(f" Erro ao adicionar metadados ao Dolphin Anty para {self.username}: {e_dolphin}")

        except IOError as e:
            self.status.emit(f" Erro de I/O ao salvar dados da conta {self.username}: {e}")
        except Exception as e:
            self.status.emit(f" Erro inesperado ao salvar conta {self.username}: {e}")


    def _tentar_preencher_biografia(self, wait):
        if self._stop: return False
        texto_bio_original = self.config_bio.get('texto_bio_final')
        if not texto_bio_original:
            self.status.emit(f" Nenhuma biografia para preencher para {self.username}.")
            return False

        texto_bio_limpo = self._remover_emojis(texto_bio_original)
        if not texto_bio_limpo:
            self.status.emit(f" Biografia ficou vazia após remover emojis para {self.username}.")
            return False

        self.status.emit(f" Tentando preencher biografia para {self.username}...")
        try:
            if "accounts/edit" not in self.driver.current_url.lower():
                self.status.emit(f" Navegando para editar perfil (para bio) ({self.username})...")
                self.driver.get("https://www.instagram.com/accounts/edit/")
                QThread.msleep(random.randint(3000, 5000))

            if self._stop: return False
            if "login" in self.driver.current_url.lower() or "challenge" in self.driver.current_url.lower():
                self.status.emit(f" Sessão perdida ou desafio ao tentar editar bio de {self.username}.")
                return False

            bio_textarea_selectors = [
                (By.ID, "pepBio"),
                (By.XPATH, "//textarea[contains(@aria-label, 'Bio') or contains(@placeholder, 'Bio')]"),
                (By.XPATH, "//textarea")
            ]
            bio_field = None
            for selector in bio_textarea_selectors:
                if self._stop: return False
                try:
                    bio_field = wait.until(EC.presence_of_element_located(selector))
                    if bio_field:
                        self.status.emit(f" Campo de biografia encontrado com seletor: {selector}")
                        break
                except TimeoutException:
                    self.status.emit(f" Campo de biografia não encontrado com seletor: {selector}")

            if not bio_field:
                self.status.emit(f" Campo de biografia não encontrado para {self.username}.")
                return False

            self.status.emit(f" Preenchendo biografia (limpa): '{texto_bio_limpo[:50]}...'")
            bio_field.clear()
            QThread.msleep(300)
            bio_field.send_keys(texto_bio_limpo)
            QThread.msleep(500)

            submit_button_selectors = [
                (By.XPATH, "//div[@role='button'][normalize-space()='Enviar']"),
                (By.XPATH, "//button[normalize-space()='Enviar']"),
                (By.XPATH, "//div[@role='button'][normalize-space()='Concluído']"),
                (By.XPATH, "//button[normalize-space()='Concluído']"),
                (By.CSS_SELECTOR, "form button[type='submit']")
            ]
            submit_button = None
            for selector in submit_button_selectors:
                if self._stop: return False
                try:
                    submit_button = wait.until(EC.element_to_be_clickable(selector))
                    if submit_button:
                        self.status.emit(f" Botão 'Enviar/Concluído' (bio) encontrado. Clicando...")
                        submit_button.click()
                        QThread.msleep(random.randint(3000, 5000))
                        self.status.emit(f" Biografia para {self.username} provavelmente salva.")
                        return True
                except:
                    pass

            self.status.emit(f" Botão 'Enviar/Concluído' (bio) não encontrado após preencher biografia para {self.username}.")
            return False

        except Exception as e:
            self.status.emit(f" Erro inesperado ao preencher biografia para {self.username}: {e}")
            return False

    def _tentar_postar_fotos(self, wait):
        if self._stop: return 0
        self.status.emit(f"[DEBUG] config_posts recebido: {repr(self.config_posts)}")
        caminho_pasta = self.config_posts.get('caminho_pasta_fotos')
        num_fotos_postar_desejado = self.config_posts.get('num_fotos_a_postar', 0)
        intervalo_entre_posts_seg = self.config_posts.get('intervalo_entre_posts', 5)

        self.status.emit(f"[DEBUG] Caminho da pasta recebido para postagem: {repr(caminho_pasta)}")
        if not caminho_pasta or not os.path.isdir(caminho_pasta) or num_fotos_postar_desejado <= 0:
            self.status.emit(f" Postagem desativada ou pasta/quantidade inválida para {self.username}.")
            return 0

        self.status.emit(f" Meta: Postar {num_fotos_postar_desejado} foto(s) da pasta: {caminho_pasta}...")

        try:
            # Lista todas as imagens válidas na pasta
            arquivos_imagem_todos = [
                f for f in os.listdir(caminho_pasta)
                if os.path.isfile(os.path.join(caminho_pasta, f)) and f.lower().endswith(('.png', '.jpg', '.jpeg'))
            ]
        except Exception as e:
            self.status.emit(f" Erro ao listar arquivos na pasta de fotos: {e}")
            return 0

        if not arquivos_imagem_todos:
            self.status.emit(f" Nenhuma imagem encontrada na pasta: {caminho_pasta}")
            return 0

        # Cria uma cópia da lista para usar como pool de fotos disponíveis
        arquivos_imagem_disponiveis = list(arquivos_imagem_todos)
        fotos_postadas_com_sucesso = 0
        tentativas_gerais = 0 # Contador para evitar loops infinitos em casos extremos
        max_tentativas_gerais = num_fotos_postar_desejado + len(arquivos_imagem_todos) + 5 # Uma margem de segurança

        # Loop principal: continua enquanto a meta não for atingida E houver fotos disponíveis E não for parado
        while fotos_postadas_com_sucesso < num_fotos_postar_desejado and arquivos_imagem_disponiveis and not self._stop and tentativas_gerais < max_tentativas_gerais:

            tentativas_gerais += 1
            # --- INÍCIO DO BLOCO ADICIONADO PARA DISPENSAR POP-UPS ---
            # Tentar dispensar pop-ups ANTES de tentar qualquer ação para uma nova foto
            if fotos_postadas_com_sucesso > 0 or tentativas_gerais > 1 : # Se já postou algo ou é uma nova tentativa para a mesma meta
                self.status.emit(f" Tentando dispensar pop-ups antes da próxima tentativa/postagem...")
                popups_xpath_entre_posts = [
                    "//button[contains(text(),'Agora não')]",
                    "//button[contains(text(),'Not Now')]",
                    "//button[contains(translate(., 'ABCDEFGHJIKLMNOPQRSTUVWXYZ', 'abcdefghjiklmnopqrstuvwxyz'), 'permitir cookies')]", # Permitir cookies (case-insensitive)
                    "//button[contains(translate(., 'ABCDEFGHJIKLMNOPQRSTUVWXYZ', 'abcdefghjiklmnopqrstuvwxyz'), 'aceitar tudo')]", # Aceitar tudo (case-insensitive)
                    "//div[@role='dialog']//button[contains(text(),'OK')]",
                    "//div[@aria-label='Fechar' or @aria-label='Close']",
                    # Adicione outros seletores de pop-ups comuns que você observar, por exemplo:
                    "//div[contains(@class, '_a9-z')]//button[contains(text(), 'OK')]", # Pop-up de "Publicação compartilhada" pode ter um OK
                    "//div[@role='dialog']//div[@aria-label='Fechar']", # Outra forma de botão fechar em diálogo
                ]
                for xpath_popup in popups_xpath_entre_posts:
                    if self._stop: break
                    try:
                        # Usar WebDriverWait para encontrar o botão e torná-lo clicável
                        popup_btn = WebDriverWait(self.driver, 1).until( # Timeout reduzido para 1s
                            EC.element_to_be_clickable((By.XPATH, xpath_popup))
                        )
                        self.status.emit(f" Tentando fechar pop-up: {xpath_popup}")
                        # Tentar clique com JavaScript como primeira opção para maior robustez contra interceptações
                        self.driver.execute_script("arguments[0].click();", popup_btn)
                        self.status.emit(f" Pop-up '{xpath_popup}' dispensado (via JS).")
                        QThread.msleep(1000) # Pequena pausa após fechar
                    except TimeoutException: # Se o botão não for encontrado, apenas continue
                        pass
                    except Exception as e_popup_click: # Captura outras exceções de clique
                        self.status.emit(f" Erro ao tentar fechar pop-up '{xpath_popup}' (JS): {e_popup_click}")
                        try: # Tentar um clique normal como fallback
                            # Tentativa de encontrar o elemento novamente antes de clicar
                            popup_btn_fallback = self.driver.find_element(By.XPATH, xpath_popup)
                            popup_btn_fallback.click()
                            self.status.emit(f" Pop-up '{xpath_popup}' dispensado (via clique normal).")
                            QThread.msleep(1000)
                        except Exception as e_popup_click_normal:
                            self.status.emit(f" Clique normal no pop-up '{xpath_popup}' também falhou: {e_popup_click_normal}")
                if self._stop: break
            # --- FIM DO BLOCO ADICIONADO PARA DISPENSAR POP-UPS ---


            # Verifica se foi parado antes de escolher a foto
            if self._stop: break

            # Escolhe um índice

            # Verifica se foi parado antes de escolher a foto
            if self._stop: break

            # Escolhe um índice aleatório da lista de disponíveis
            try:
                 indice_escolhido = random.randrange(len(arquivos_imagem_disponiveis))
                 nome_foto = arquivos_imagem_disponiveis[indice_escolhido]
                 # Remove a foto escolhida da lista de disponíveis para não tentar de novo nesta execução
                 del arquivos_imagem_disponiveis[indice_escolhido]
            except ValueError: # Caso a lista fique vazia entre a condição do while e aqui
                 self.status.emit(" Lista de fotos disponíveis esgotada inesperadamente.")
                 break

            caminho_completo_foto = os.path.join(caminho_pasta, nome_foto)
            self.status.emit(f"--- [Tentativa {tentativas_gerais}] Meta: {fotos_postadas_com_sucesso+1}/{num_fotos_postar_desejado}. Postando: {nome_foto} ---")

            post_bem_sucedido_nesta_iteracao = False
            try:
                # 0. Verifica se a sessão ainda está ativa antes de tentar
                if "login" in self.driver.current_url.lower() or "challenge" in self.driver.current_url.lower():
                    self.status.emit(f" Sessão perdida ou desafio antes de postar '{nome_foto}' para {self.username}.")
                    # Neste caso, provavelmente não adianta tentar outras fotos, então quebramos o loop principal.
                    # Poderia tentar relogar, mas isso complica muito o fluxo.
                    self._stop = True # Sinaliza para parar o processo geral da conta
                    break

                # 1. Clica no botão "Criar"
                create_post_button_selectors = [
                    # Botão com ícone de "+", geralmente visível na home
                    (By.XPATH, "//div[@role='menuitem']//div[contains(@aria-label, 'Nova publicação')]"),
                    (By.XPATH, "//div[@role='button']//span[contains(text(),'Criar')]"),
                    (By.XPATH, "//button[contains(text(), 'Criar')]"),
                    (By.CSS_SELECTOR, "svg[aria-label='Nova publicação'], svg[aria-label='New post']"),
                    (By.XPATH, "//div[contains(@class, 'x1i10hfl') or contains(@class, 'x6s0dn4')]//div[@role='button']")
                ]
                create_button = None
                for selector in create_post_button_selectors:
                    if self._stop: break
                    try:
                        create_button = wait.until(EC.element_to_be_clickable(selector))
                        if create_button: break
                    except: pass

                if self._stop: break
                if not create_button:
                    self.status.emit(f" Botão 'Criar nova publicação' não encontrado para '{nome_foto}'. Pulando para próxima tentativa.")
                    continue

                self.status.emit(" Clicando em 'Criar nova publicação'...")
                # --- INÍCIO DA MODIFICAÇÃO DO CLIQUE 'CRIAR' ---
                try:
                    # Clique direto, sem rolar a página
                    create_button.click() # Tenta o clique direto primeiro
                except ElementClickInterceptedException:
                    self.status.emit(" Clique direto no 'Criar' interceptado. Tentando clique com JavaScript...")
                    try:
                        self.driver.execute_script("arguments[0].click();", create_button)
                    except Exception as e_js_click:
                        self.status.emit(f" Clique JS no 'Criar' também falhou: {e_js_click}. Pulando para próxima tentativa.")
                        # Tenta fechar o modal se ele abriu e depois navegar para home
                        try:
                            close_modal_btn = WebDriverWait(self.driver, 2).until(
                                EC.element_to_be_clickable((By.XPATH, "//*[local-name()='svg' and @aria-label='Fechar']/ancestor::div[@role='button']"))
                            )
                            close_modal_btn.click()
                            self.status.emit(" Modal de postagem (falha no Criar) fechado.")
                        except:
                            self.status.emit(" Não foi possível fechar o modal de postagem após falha no Criar.")
                        try:
                            self.status.emit(f" Tentando voltar para a página inicial para continuar (após falha no Criar)...")
                            self.driver.get("https://www.instagram.com/")
                            QThread.msleep(random.randint(2000,3000))
                        except:
                            self.status.emit(f" Não foi possível voltar para a página inicial após erro no Criar.")
                        continue # Pula para a próxima iteração do WHILE (próxima foto/tentativa)
                except Exception as e_click_criar:
                    self.status.emit(f" Erro inesperado ao clicar em 'Criar': {e_click_criar}. Pulando para próxima tentativa.")
                    try:
                        close_modal_btn = WebDriverWait(self.driver, 2).until(
                            EC.element_to_be_clickable((By.XPATH, "//*[local-name()='svg' and @aria-label='Fechar']/ancestor::div[@role='button']"))
                        )
                        close_modal_btn.click()
                        self.status.emit(" Modal de postagem (falha no Criar) fechado.")
                    except:
                        self.status.emit(" Não foi possível fechar o modal de postagem após falha no Criar.")
                    try:
                        self.status.emit(f" Tentando voltar para a página inicial para continuar (após falha no Criar)...")
                        self.driver.get("https://www.instagram.com/")
                        QThread.msleep(random.randint(2000,3000))
                    except:
                        self.status.emit(f" Não foi possível voltar para a página inicial após erro no Criar.")
                    continue # Pula para a próxima iteração do WHILE
                # --- FIM DA MODIFICAÇÃO DO CLIQUE 'CRIAR' ---

                QThread.msleep(random.randint(2000, 3000))
                if self._stop: break

                # 2. Faz o upload da imagem
                upload_input_selectors = [
                    (By.XPATH, "//button[contains(text(),'Selecionar do computador')]"),
                    (By.XPATH, "//input[@type='file' and @accept='image/jpeg,image/png,image/heic,image/heif,video/mp4,video/quicktime']")
                ]
                upload_element = None
                try:
                    select_from_computer_btn = WebDriverWait(self.driver, 5).until(EC.element_to_be_clickable(upload_input_selectors[0]))
                    self.status.emit(" Clicando em 'Selecionar do computador'...")
                    select_from_computer_btn.click()
                    QThread.msleep(1000)
                    upload_element = WebDriverWait(self.driver, 5).until(EC.presence_of_element_located(upload_input_selectors[1]))
                except:
                    self.status.emit(" Botão 'Selecionar do computador' não encontrado/falhou. Tentando input direto.")
                    # NOVO: Listar todos os <input type='file'> presentes na página
                    try:
                        file_inputs = self.driver.find_elements(By.XPATH, "//input[@type='file']")
                        self.status.emit(f"[DEBUG] Foram encontrados {len(file_inputs)} <input type='file'> na página.")
                        for idx, inp in enumerate(file_inputs):
                            try:
                                attrs = self.driver.execute_script('var items = {}; for (index = 0; index < arguments[0].attributes.length; ++index) { items[arguments[0].attributes[index].name] = arguments[0].attributes[index].value }; return items;', inp)
                                self.status.emit(f"[DEBUG] input[{idx}] atributos: {attrs}")
                            except Exception as e_attr:
                                self.status.emit(f"[DEBUG] Erro ao ler atributos do input[{idx}]: {e_attr}")
                    except Exception as e_fileinputs:
                        self.status.emit(f"[DEBUG] Erro ao buscar inputs de arquivo: {e_fileinputs}")
                    try:
                        upload_element = wait.until(EC.presence_of_element_located(upload_input_selectors[1]))
                    except TimeoutException:
                        self.status.emit(f" Input de arquivo para post não encontrado para '{nome_foto}'. Pulando para próxima tentativa.")
                        # Tenta fechar o modal se ele abriu
                        try:
                            close_modal_btn = self.driver.find_element(By.XPATH, "//*[local-name()='svg' and @aria-label='Fechar']/ancestor::div[@role='button']")
                            close_modal_btn.click()
                        except: pass
                        continue # Pula para a próxima iteração do WHILE

                if self._stop: break
                if not upload_element:
                    self.status.emit(f" Não foi possível encontrar o elemento para upload da foto '{nome_foto}'. Pulando para próxima tentativa.")
                    continue # Pula para a próxima iteração do WHILE

                self.status.emit(f" Enviando foto para post: {caminho_completo_foto}")
                upload_element.send_keys(caminho_completo_foto)
                QThread.msleep(random.randint(3000, 5000))
                if self._stop: break

                # 3. Clica em Avançar (até 2 vezes)
                for _ in range(2):
                    if self._stop: break
                    try:
                        avancar_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//div[@role='button'][normalize-space()='Avançar' or normalize-space()='Next']")))
                        self.status.emit(" Clicando em 'Avançar'...")
                        avancar_btn.click()
                        QThread.msleep(random.randint(1500, 2500))
                    except TimeoutException:
                        self.status.emit(" Botão 'Avançar' não encontrado nesta etapa (ou não necessário).")
                        break
                    except StaleElementReferenceException:
                        self.status.emit(" Botão 'Avançar' ficou obsoleto. Continuando...")
                        QThread.msleep(1000)
                        break
                    except Exception as e_avancar:
                        self.status.emit(f" Erro inesperado ao clicar em 'Avançar': {e_avancar}. Continuando fluxo...")
                        break # Sai do loop de avançar e tenta compartilhar

                if self._stop: break

                # 4. Clica em Compartilhar
                # --- INÍCIO DA MODIFICAÇÃO DO CLIQUE 'COMPARTILHAR' E TRATAMENTO DE ERRO ---
                try:
                    compartilhar_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//div[@role='button'][normalize-space()='Compartilhar' or normalize-space()='Share']")))
                    self.status.emit(" Clicando em 'Compartilhar'...")
                    try:
                        # Clique direto, sem rolar a página
                        compartilhar_btn.click() # Tenta o clique direto primeiro
                    except ElementClickInterceptedException:
                        self.status.emit(" Clique direto no 'Compartilhar' interceptado. Tentando clique com JavaScript...")
                        self.driver.execute_script("arguments[0].click();", compartilhar_btn)

                    QThread.msleep(random.randint(5000, 8000)) # Espera postagem

                    # Verificar se houve erro após o clique (ex: mensagem de erro na tela)
                    try:
                        error_post_msg = WebDriverWait(self.driver, 2).until(
                            EC.presence_of_element_located((By.XPATH, "//*[contains(text(),'Falha ao carregar') or contains(text(),'Não foi possível publicar') or contains(text(), 'ocorreu um erro')]")) # Adicione mais frases de erro
                        )
                        if error_post_msg:
                            self.status.emit(f" Erro detectado após clicar em compartilhar para '{nome_foto}'. Mensagem: {error_post_msg.text}")
                            raise Exception("Falha na postagem detectada por mensagem de erro.") # Força cair no except abaixo
                    except TimeoutException:
                        # Nenhuma mensagem de erro óbvia, assume sucesso
                        self.status.emit(f" Foto '{nome_foto}' postada com sucesso!")
                        fotos_postadas_com_sucesso += 1
                        post_bem_sucedido_nesta_iteracao = True # Marca que esta iteração foi OK

                except TimeoutException: # Se o botão "Compartilhar" não for encontrado
                    self.status.emit(f" Botão 'Compartilhar' não encontrado para a foto '{nome_foto}'. Postagem falhou.")
                    try:
                        close_modal_btn = WebDriverWait(self.driver, 3).until(
                            EC.element_to_be_clickable((By.XPATH, "//*[local-name()='svg' and @aria-label='Fechar']/ancestor::div[@role='button']"))
                        )
                        close_modal_btn.click()
                        self.status.emit(" Modal de postagem (falha no Compartilhar/Timeout) fechado.")
                    except:
                        self.status.emit(" Não foi possível fechar o modal de postagem após falha no Compartilhar/Timeout.")
                    # Não incrementa sucesso, loop while continua
                except Exception as e_compartilhar: # Captura qualquer outra exceção durante a tentativa de compartilhar ou após
                    self.status.emit(f" Erro ao tentar compartilhar a foto '{nome_foto}': {type(e_compartilhar).__name__} - {str(e_compartilhar).splitlines()[0]}")
                    try:
                        close_modal_btn = WebDriverWait(self.driver, 3).until(
                            EC.element_to_be_clickable((By.XPATH, "//*[local-name()='svg' and @aria-label='Fechar']/ancestor::div[@role='button']"))
                        )
                        close_modal_btn.click()
                        self.status.emit(" Modal de postagem (falha no Compartilhar/Exceção) fechado.")
                    except:
                        self.status.emit(" Não foi possível fechar o modal de postagem após falha no Compartilhar/Exceção.")
                # --- FIM DA MODIFICAÇÃO DO CLIQUE 'COMPARTILHAR' E TRATAMENTO DE ERRO ---

            # Captura qualquer outra exceção DURANTE A TENTATIVA DE POSTAR ESTA FOTO (bloco try principal da foto)
            except Exception as e_post: # Este 'except' é do 'try' que engloba toda a lógica de postagem de UMA foto
                self.status.emit(f" Erro inesperado GERAL ao tentar postar a foto '{nome_foto}': {type(e_post).__name__} - {str(e_post).splitlines()[0]}")
                # Tenta se recuperar navegando para a home
                try:
                    self.status.emit(f" Tentando voltar para a página inicial para continuar (após erro GERAL no post)...")
                    self.driver.get("https://www.instagram.com/")
                    QThread.msleep(random.randint(2000,3000))
                except:
                    self.status.emit(f" Não foi possível voltar para a página inicial após erro GERAL no post.")
                # Não incrementa sucesso, loop while continua

            # Verifica se foi parado durante o processo da foto
            if self._stop: break

            # Pausa entre as TENTATIVAS (bem-sucedidas ou não), se a meta ainda não foi atingida
            if fotos_postadas_com_sucesso < num_fotos_postar_desejado and arquivos_imagem_disponiveis and not self._stop:
                 if post_bem_sucedido_nesta_iteracao:
                     # --- INÍCIO DA MODIFICAÇÃO: NAVEGAR PARA HOME APÓS SUCESSO ---
                     self.status.emit(f" Navegando para a home após postagem bem-sucedida de '{nome_foto}'...")
                     try:
                         self.driver.get("https://www.instagram.com/")
                         # Esperar por um elemento distintivo da página inicial para garantir o carregamento
                         WebDriverWait(self.driver, 10).until(
                             EC.presence_of_element_located((By.XPATH, "//a[@href='/'] | //div[@role='main']")) # Ex: link para home ou feed principal
                         )
                         QThread.msleep(random.randint(1000, 1500)) # Pausa reduzida após carregar home
                         self.status.emit(f" Navegou para a home.")
                     except Exception as e_nav_home:
                         self.status.emit(f" Não foi possível navegar para a home após sucesso: {e_nav_home}")
                     # --- FIM DA MODIFICAÇÃO ---
                     self.status.emit(f" Sucesso! Aguardando {intervalo_entre_posts_seg}s antes da próxima postagem...")
                 else:
                     self.status.emit(f" Falha. Aguardando {intervalo_entre_posts_seg}s antes da próxima TENTATIVA...")
                 QThread.msleep(intervalo_entre_posts_seg * 1000)

        # --- Fim do loop WHILE ---

        if tentativas_gerais >= max_tentativas_gerais:
             self.status.emit(f" Atingido limite máximo de tentativas gerais de postagem ({max_tentativas_gerais}).")

        if not arquivos_imagem_disponiveis and fotos_postadas_com_sucesso < num_fotos_postar_desejado:
            self.status.emit(f" Não há mais fotos disponíveis na pasta para tentar atingir a meta de {num_fotos_postar_desejado}.")

        if self._stop:
             self.status.emit(f" Processo de postagem interrompido.")

        self.status.emit(f" Finalizado. Total de fotos postadas com sucesso: {fotos_postadas_com_sucesso}/{num_fotos_postar_desejado}")
        return fotos_postadas_com_sucesso


    def _tentar_atualizar_foto_perfil(self, wait):
        """Tenta atualizar a foto do perfil do Instagram."""
        if self._stop: return False
        if not self.caminho_foto_perfil or not os.path.exists(self.caminho_foto_perfil):
            self.status.emit(f" Nenhuma foto de perfil válida para {self.username}.")
            return False

        self.status.emit(f" Tentando definir foto de perfil para {self.username}...")
        try:
            self.status.emit(f" Navegando para editar perfil ({self.username})...")

            current_url_before_edit = self.driver.current_url
            self.driver.get("https://www.instagram.com/accounts/edit/")
            QThread.msleep(random.randint(4000, 6000))

            if self._stop: return False

            self.status.emit(f" URL atual após tentar ir para edição: {self.driver.current_url}")
            if "login" in self.driver.current_url.lower() or "challenge" in self.driver.current_url.lower():
                self.status.emit(f" Sessão perdida ou desafio ao tentar acessar página de edição de {self.username}. Não é possível definir foto.")
                if current_url_before_edit and "instagram.com" in current_url_before_edit:
                    try: self.driver.get(current_url_before_edit)
                    except: pass
                return False
            if "accounts/edit" not in self.driver.current_url.lower():
                self.status.emit(f" Não foi possível navegar para a página de edição de perfil de {self.username}.")
                return False

            try:
                change_photo_button_selectors = [
                    (By.XPATH, "//button[contains(.,'Mudar foto')]"),
                    (By.XPATH, "//span[contains(.,'Mudar foto')]"),
                    (By.XPATH, "//*[contains(text(),'Mudar foto do perfil')]")
                ]
                mudar_foto_btn = None
                self.status.emit(" Procurando botão/link 'Mudar foto'...")
                for selector in change_photo_button_selectors:
                    if self._stop: return False
                    try:
                        mudar_foto_btn = WebDriverWait(self.driver, 7).until(EC.element_to_be_clickable(selector))
                        if mudar_foto_btn:
                            self.status.emit(" Botão/link 'Mudar foto' encontrado. Clicando...")
                            mudar_foto_btn.click()
                            QThread.msleep(random.randint(1500, 2500))
                            break
                    except:
                        pass

                if not mudar_foto_btn:
                    self.status.emit(" Botão/link 'Mudar foto' não encontrado. Tentando input direto.")

            except Exception as e_btn:
                self.status.emit(f" Erro ao procurar/clicar botão 'Mudar foto': {e_btn}.")

            if self._stop: return False

            input_foto_selectors = [
                (By.XPATH, '//input[@type="file" and @accept="image/jpeg,image/png,image/heic,image/heif"]'),
                (By.XPATH, '//input[@type="file" and contains(@aria-label, "foto")]'),
                (By.XPATH, '//form//input[@type="file"]')
            ]

            input_foto_element = None
            self.status.emit(" Procurando input de arquivo de foto...")
            for selector in input_foto_selectors:
                if self._stop: return False
                try:
                    input_foto_element = WebDriverWait(self.driver, 10).until(EC.presence_of_element_located(selector))
                    if input_foto_element:
                        self.status.emit(" Input de foto encontrado com seletor: {selector[1]}")
                        break
                except TimeoutException:
                    self.status.emit(" Input de foto não encontrado com seletor: {selector[1]}")

            if not input_foto_element:
                self.status.emit(f" Não foi possível encontrar o input[type=file] para a foto de perfil de {self.username}.")
                return False

            if self._stop: return False

            abs_photo_path = os.path.abspath(self.caminho_foto_perfil)
            self.status.emit(f" Enviando caminho absoluto da foto: {abs_photo_path}")
            input_foto_element.send_keys(abs_photo_path)
            self.status.emit(" Aguardando upload/processamento da foto...")
            QThread.msleep(random.randint(7000, 10000))

            if self._stop: return False

            photo_confirm_selectors = [
                (By.XPATH, "//button[contains(text(), 'Concluído')]"),
                (By.XPATH, "//button[contains(text(), 'Aplicar')]"),
                (By.XPATH, "//div[@role='button' and contains(text(), 'Concluído')]")
            ]
            photo_confirm_button = None
            self.status.emit("🖱️ Procurando botão de confirmação da foto (Concluído/Aplicar)...")
            for selector in photo_confirm_selectors:
                if self._stop: return False
                try:
                    photo_confirm_button = WebDriverWait(self.driver, 7).until(EC.element_to_be_clickable(selector))
                    if photo_confirm_button:
                        self.status.emit("🖱️ Botão de confirmação da foto encontrado. Clicando...")
                        photo_confirm_button.click()
                        QThread.msleep(random.randint(2000, 4000))
                        break
                except:
                    pass

            if not photo_confirm_button:
                self.status.emit("ℹ️ Nenhum botão específico de confirmação de foto encontrado. Tentando salvar perfil geral.")

            if self._stop: return False

            submit_button_selectors = [
                (By.XPATH, "//div[@role='button'][normalize-space()='Enviar']"),
                (By.XPATH, "//button[normalize-space()='Enviar']"),
                (By.XPATH, "//div[@role='button'][normalize-space()='Concluído']"),
                (By.XPATH, "//button[normalize-space()='Concluído']"),
                (By.CSS_SELECTOR, "form button[type='submit']")
            ]

            submit_button = None
            self.status.emit(f"⏳ Procurando botão 'Enviar/Concluído' final...")
            for selector in submit_button_selectors:
                if self._stop: return False
                try:
                    submit_button = wait.until(EC.element_to_be_clickable(selector))
                    if submit_button:
                        self.status.emit(f"🖱️ Botão 'Enviar/Concluído' final encontrado.")
                        try:
                            # [REMOVIDO SCROLL] submit_button)
                            QThread.msleep(500)
                            cookie_banners_xpath = [
                                "//button[contains(translate(., 'ACEITAR', 'aceitar'), 'aceitar todos')]",
                                "//button[contains(translate(., 'ACEITAR', 'aceitar'), 'aceitar cookies')]",
                                "//div[@role='dialog']//button[contains(translate(., 'ACEITAR', 'aceitar'), 'aceitar')]"
                            ]
                            for cb_xpath in cookie_banners_xpath:
                                try:
                                    WebDriverWait(self.driver, 1).until(EC.element_to_be_clickable((By.XPATH, cb_xpath))).click()
                                    self.status.emit(f"ℹ️ Possível overlay/cookie banner fechado ({cb_xpath}).")
                                    QThread.msleep(300)
                                except: pass

                            submit_button.click()
                            self.status.emit("🎉 Clique direto no botão 'Enviar/Concluído' (foto) realizado.")
                        except ElementClickInterceptedException:
                            self.status.emit("⚠️ Clique direto interceptado. Tentando clique com JavaScript...")
                            self.driver.execute_script("arguments[0].click();", submit_button)
                            self.status.emit("🎉 Clique com JavaScript no botão 'Enviar/Concluído' (foto) realizado.")

                        QThread.msleep(random.randint(4000, 6000))

                        try:
                            WebDriverWait(self.driver, 5).until(EC.presence_of_element_located((By.XPATH, "//*[contains(text(),'Perfil salvo') or contains(text(),'Profile saved')]")))
                            self.status.emit(f"✅ Foto de perfil para {self.username} atualizada e perfil salvo (Mensagem encontrada).")
                            return True
                        except TimeoutException:
                            if "accounts/edit" not in self.driver.current_url:
                                self.status.emit(f"✅ Foto de perfil para {self.username} atualizada e perfil salvo (URL mudou).")
                                return True
                            else:
                                self.status.emit(f"⚠️ Perfil salvo (provavelmente), mas confirmação visual não encontrada para {self.username}.")
                                return True
                except (TimeoutException, ElementNotInteractableException):
                    self.status.emit(f"⚠️ Botão 'Enviar/Concluído' final não encontrado/clicável com seletor: {selector[1]}")

            self.status.emit(f"❌ Botão 'Enviar/Concluído' final não encontrado após tentativa de upload para {self.username}.")
            return False

        except TimeoutException as e:
            self.status.emit(f"❌ Timeout ao tentar atualizar foto de perfil para {self.username}: {str(e).splitlines()[0]}")
            return False
        except NoSuchElementException as e:
            self.status.emit(f"❌ Elemento não encontrado ao tentar atualizar foto ({self.username}): {str(e).splitlines()[0]}")
            return False
        except Exception as e:
            self.status.emit(f"❌ Erro inesperado ao atualizar foto de perfil para {self.username}: {e}")
            return False


    def verificar_email_hostinger(self, start_check_time):
        parent_gui = self.get_parent_interface()
        if not parent_gui:
            self.status.emit("❌ Erro crítico: Interface pai não encontrada no worker.")
            return ""

        email_user_imap = parent_gui.email_user_input.text()
        senha_imap = parent_gui.email_senha_input.text()

        if not email_user_imap or not senha_imap:
            self.status.emit("⚠️ Por favor, insira as credenciais do e-mail (usuário e senha IMAP) nas configurações.")
            return ""

        mail = None
        try:
            self.status.emit(f"📡 Conectando ao IMAP (imap.hostinger.com) com {email_user_imap}...")
            mail = imaplib.IMAP4_SSL("imap.hostinger.com")
            self.status.emit("🔐 Login no IMAP...")
            mail.login(email_user_imap, senha_imap)
            self.status.emit("✅ Login IMAP OK.")
            mail.select("inbox")

            tentativas_maximas = 12
            espera_entre_tentativas = self.intervalo_email_check
            brasilia_timezone = timezone('America/Sao_Paulo')

            for tentativa in range(tentativas_maximas):
                if self._stop:
                    self.status.emit("❌ Verificação de e-mail interrompida.")
                    return ""

                self.status.emit(f"🔍 Tentativa {tentativa + 1}/{tentativas_maximas} de buscar e-mail do Instagram...")
                mail.noop()

                date_today = datetime.now(brasilia_timezone).strftime('%d-%b-%Y')
                status_search, data_search = mail.search(None, f'(FROM "instagram" SINCE "{date_today}")')

                if status_search != 'OK':
                    self.status.emit("❌ Falha ao buscar e-mails no servidor.")
                    QThread.msleep(espera_entre_tentativas * 1000)
                    continue

                mail_ids = data_search[0].split()
                if not mail_ids:
                    self.status.emit(f"⏳ Nenhum e-mail do Instagram hoje. Aguardando {espera_entre_tentativas}s...")
                    QThread.msleep(espera_entre_tentativas * 1000)
                    continue

                latest_valid_email_id = None
                latest_valid_email_time = None

                for email_id_bytes in reversed(mail_ids):
                    if self._stop: return ""

                    try:
                        status_fetch_date, date_data = mail.fetch(email_id_bytes, '(INTERNALDATE)')
                        if status_fetch_date != 'OK' or not date_data or not date_data[0]:
                            status_fetch_date, date_data = mail.fetch(email_id_bytes, '(BODY[HEADER.FIELDS (DATE)])')
                            if status_fetch_date != 'OK' or not date_data or not date_data[0]: continue

                            date_header = date_data[0][1].decode('utf-8', errors='ignore')
                            match_date = re.search(r'^Date:\s*(.*)', date_header, re.MULTILINE | re.IGNORECASE)
                            if not match_date: continue
                            timestamp_str = match_date.group(1).strip()
                            parsed_date = email.utils.parsedate_to_datetime(timestamp_str)
                        else:
                            date_str_internal = date_data[0].decode('utf-8', errors='ignore')
                            match_internal = re.search(r'"([^"]+)"', date_str_internal)
                            if not match_internal: continue
                            try:
                                parsed_date = email.utils.parsedate_to_datetime(match_internal.group(1))
                            except Exception as e_int_parse:
                                self.status.emit(f"⚠️ Erro parse INTERNALDATE '{match_internal.group(1)}': {e_int_parse}")
                                continue

                        email_time_utc = parsed_date.astimezone(utc) if parsed_date.tzinfo else utc.localize(parsed_date)
                        email_time_brasilia = email_time_utc.astimezone(brasilia_timezone)

                        if email_time_brasilia > start_check_time:
                            if latest_valid_email_time is None or email_time_brasilia > latest_valid_email_time:
                                latest_valid_email_time = email_time_brasilia
                                latest_valid_email_id = email_id_bytes

                    except Exception as e_date:
                        self.status.emit(f"⚠️ Erro ao processar data do e-mail ID {email_id_bytes.decode()}: {e_date}")
                        continue

                if latest_valid_email_id:
                    self.status.emit(f"📨 E-mail NOVO mais recente ID: {latest_valid_email_id.decode()} - Hora: {latest_valid_email_time.strftime('%H:%M:%S')}")

                    status_fetch_body, msg_data = mail.fetch(latest_valid_email_id, '(RFC822)')
                    if status_fetch_body != 'OK' or not msg_data or not msg_data[0]:
                        self.status.emit(f"❌ Falha ao buscar corpo do e-mail ID {latest_valid_email_id.decode()}")
                        continue

                    raw_email = msg_data[0][1]
                    msg = email.message_from_bytes(raw_email)
                    body = ""

                    if msg.is_multipart():
                        for part in msg.walk():
                            if self._stop: return ""
                            ctype = part.get_content_type()
                            cdisp = str(part.get('Content-Disposition'))
                            if ctype in ["text/plain", "text/html"] and 'attachment' not in cdisp:
                                try:
                                    payload = part.get_payload(decode=True)
                                    for encoding_type in ['utf-8', 'latin-1', 'iso-8859-1']:
                                        try: body = payload.decode(encoding_type); break
                                        except: continue
                                    if body: break
                                except: continue
                    else:
                        ctype = msg.get_content_type()
                        cdisp = str(msg.get('Content-Disposition'))
                        if ctype in ["text/plain", "text/html"] and 'attachment' not in cdisp:
                            try:
                                payload = msg.get_payload(decode=True)
                                for encoding_type in ['utf-8', 'latin-1', 'iso-8859-1']:
                                    try: body = payload.decode(encoding_type); break
                                    except: continue
                            except: pass

                    if not body:
                        self.status.emit("⚠️ Corpo do e-mail válido mais recente vazio ou ilegível.")
                        QThread.msleep(espera_entre_tentativas * 1000)
                        continue

                    code = ""
                    patterns = [
                        re.compile(r'Seu código do Instagram é (\d{6})'), re.compile(r'Your Instagram code is (\d{6})'),
                        re.compile(r'Use este código: (\d{6})'), re.compile(r'Here\'s your code: (\d{6})'),
                        re.compile(r'código de confirmação é (\d{6})'), re.compile(r'confirmation code is (\d{6})'),
                        re.compile(r'código: (\d{6})'), re.compile(r'code: (\d{6})'),
                        re.compile(r'código de segurança (\d{6})'), re.compile(r'security code (\d{6})'),
                        re.compile(r'\b(\d{6})\b')
                    ]
                    for pattern in patterns:
                        if self._stop: return ""
                        match = pattern.search(body)
                        if match: code = match.group(1) if len(match.groups()) > 0 else match.group(0); break

                    if code and len(code) == 6 and code.isdigit():
                        self.status.emit(f"🔢 Código VÁLIDO extraído: {code}")
                        return code
                    else:
                        self.status.emit(f"⚠️ Nenhum código encontrado no e-mail novo ID: {latest_valid_email_id.decode()}.")

                self.status.emit(f"⏳ Nenhum e-mail *novo* do Instagram encontrado. Aguardando {espera_entre_tentativas}s...")
                QThread.msleep(espera_entre_tentativas * 1000)

            self.status.emit("❌ Tentativas de buscar e-mail excedidas sem encontrar código novo.")
            return ""
        except imaplib.IMAP4.error as e:
            self.status.emit(f"❌ Erro IMAP: {e}.")
            return ""
        except Exception as e:
            self.status.emit(f"❌ Erro inesperado ao verificar e-mail: {e}")
            return ""
        finally:
            if mail:
                try: mail.logout(); self.status.emit("🔌 Desconectado do IMAP.")
                except: pass

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
            # Lógica de inicialização do Chrome (baseada no trecho do arquivo original.py)
            options = Options() # selenium.webdriver.chrome.options.Options
            options.add_argument("--start-maximized")
            # options.add_argument("--headless")
            # options.add_argument("--disable-gpu")
            options.add_experimental_option('excludeSwitches', ['enable-logging'])
            options.add_experimental_option('useAutomationExtension', False)
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")

            # Não usar user-data-dir para evitar criação de subpastas
            self.status.emit(f"⚠️ user_data_dir ignorado para {self.username}. Usando sessão temporária e cookies otimizados.")

            try:
                self.driver = webdriver.Chrome(options=options)
                self.status.emit(f"🌐 Driver Chrome OK para {self.username}.")
                self.driver.delete_all_cookies() # Limpa cookies no início da sessão do driver
                self.status.emit(f"🍪 Cookies limpos para {self.username} no início.")

            except Exception as e:
                self.status.emit(f"❌ Erro ChromeDriver para {self.username}: {e}.")
                final_message = f"❌ Falha ao iniciar navegador Chrome para {self.username}."
                self.finished.emit(final_message)
                return

            if self._stop: final_message = f"🛑 {self.username} parado após iniciar driver."; self.finished.emit(final_message); return

            self.status.emit(f"🔗 Acessando Instagram (cadastro) para {self.username}...")
            self.driver.get("https://www.instagram.com/accounts/emailsignup/")
            wait = WebDriverWait(self.driver, 25)

            self.status.emit(f"📝 Preenchendo dados iniciais para {self.username}...")
            try:
                wait.until(EC.presence_of_element_located((By.NAME, "emailOrPhone"))).send_keys(self.email_conta)
                wait.until(EC.presence_of_element_located((By.NAME, "fullName"))).send_keys(parent_gui.nome_atual_para_worker)
                wait.until(EC.presence_of_element_located((By.NAME, "username"))).send_keys(self.username)
                wait.until(EC.presence_of_element_located((By.NAME, "password"))).send_keys(self.password)
                self.status.emit(f"✅ Dados iniciais OK ({self.username}).")
                QThread.msleep(random.randint(1500, 3000))
            except Exception as e_fill:
                self.status.emit(f"❌ Erro ao preencher campos iniciais para {self.username}: {e_fill}")
                final_message = f"❌ Falha ao preencher campos iniciais para {self.username}."
                self.finished.emit(final_message); return


            if self._stop: final_message = f"🛑 {self.username} parado antes do 1º clique."; self.finished.emit(final_message); return

            self.status.emit(f"⏳ Procurando botão 'Cadastre-se' para {self.username}...")
            signup_button = None
            signup_button_xpath = "//button[@type='submit']"
            try:
                signup_button = wait.until(EC.element_to_be_clickable((By.XPATH, signup_button_xpath)))
            except TimeoutException:
                self.status.emit(f"❌ Botão 'Cadastre-se' não encontrado ou não clicável para {self.username} com XPATH: {signup_button_xpath}.")
                final_message = f"❌ Botão 'Cadastre-se' não encontrado para {self.username}."
                self.finished.emit(final_message); return

            if signup_button:
                self.status.emit(f"🖱️ Tentando clicar em 'Cadastre-se' ({self.username})...")
                current_url_before_signup_click = self.driver.current_url
                try:
                    # [REMOVIDO SCROLL] signup_button)
                    QThread.msleep(500)
                    signup_button.click()
                except ElementClickInterceptedException:
                    self.status.emit(f"⚠️ Clique direto no 'Cadastre-se' interceptado. Tentando clique com JavaScript...")
                    self.driver.execute_script("arguments[0].click();", signup_button)
                except Exception as e_click_signup:
                    self.status.emit(f"❌ Erro ao clicar em 'Cadastre-se': {e_click_signup}")
                    final_message = f"❌ Falha ao clicar em 'Cadastre-se' para {self.username}."
                    self.finished.emit(final_message); return

                self.status.emit(f"🖱️ Clique em 'Cadastre-se' realizado ({self.username}). Aguardando próxima página...")
                QThread.msleep(random.randint(4000, 7000))

                self.status.emit(f"ℹ️ Tentando dispensar pop-ups pós-clique em Cadastre-se para {self.username}...")
                popups_xpath_pos_clique_cadastro = [
                    "//button[contains(text(),'Agora não')]",
                    "//button[contains(text(),'Not Now')]",
                    "//button[contains(text(),'Aceitar Cookies')]",
                    "//button[contains(text(),'Accept Cookies')]",
                    "//button[contains(text(),'Permitir')]",
                    "//div[@role='dialog']//button[contains(translate(., 'ACEITAR', 'aceitar'), 'aceitar')]"
                ]
                for xpath_popup in popups_xpath_pos_clique_cadastro:
                    if self._stop: break
                    try:
                        popup_btn = WebDriverWait(self.driver, 2).until(EC.element_to_be_clickable((By.XPATH, xpath_popup)))
                        self.status.emit(f"ℹ️ Tentando fechar pop-up: {xpath_popup}")
                        popup_btn.click()
                        self.status.emit(f"🖱️ Pop-up '{xpath_popup}' dispensado.")
                        QThread.msleep(1000)
                    except:
                        pass
                if self._stop: final_message = f"🛑 {self.username} parado após tentativa de fechar pop-ups."; self.finished.emit(final_message); return


                try:
                    WebDriverWait(self.driver, 10).until(
                        EC.presence_of_element_located((By.XPATH, "//select[@title='Dia:' or @title='Day:']"))
                    )
                    self.status.emit(f"✅ Página de data de nascimento carregada para {self.username}.")
                except TimeoutException:
                    self.status.emit(f"❌ A página não mudou para a data de nascimento após clicar em 'Cadastre-se' para {self.username}.")
                    self.status.emit(f" URL atual: {self.driver.current_url}")
                    try:
                        error_messages = self.driver.find_elements(By.XPATH, "//*[contains(@class, 'error') or contains(@class, 'warning') or contains(@id, 'error') or contains(@role, 'alert')]//span")
                        if error_messages:
                            for err_msg in error_messages:
                                if err_msg.text:
                                    self.status.emit(f" ℹ️ Mensagem na página: {err_msg.text}")
                        else:
                            self.status.emit(f" ℹ️ Nenhuma mensagem de erro óbvia encontrada na página.")
                    except:
                        self.status.emit(f" ℹ️ Não foi possível verificar mensagens de erro na página.")

                    if self.driver.current_url == current_url_before_signup_click:
                        try:
                            signup_button_again = self.driver.find_element(By.XPATH, signup_button_xpath)
                            if signup_button_again.is_displayed() and signup_button_again.is_enabled():
                                self.status.emit(f"🖱️ Tentando clique JS em 'Cadastre-se' como fallback...")
                                self.driver.execute_script("arguments[0].click();", signup_button_again)
                                QThread.msleep(random.randint(4000, 6000))
                                WebDriverWait(self.driver, 10).until(
                                    EC.presence_of_element_located((By.XPATH, "//select[@title='Dia:' or @title='Day:']"))
                                )
                                self.status.emit(f"✅ Página de data de nascimento carregada após clique JS ({self.username}).")
                            else:
                                final_message = f"❌ Falha ao avançar após 'Cadastre-se' para {self.username}. Botão não interagível para JS."
                                self.finished.emit(final_message); return
                        except Exception as e_js_fallback:
                            self.status.emit(f"❌ Clique JS fallback também falhou ou página não carregou: {e_js_fallback}")
                            final_message = f"❌ Falha ao avançar após 'Cadastre-se' para {self.username} (mesmo com JS)."
                            self.finished.emit(final_message); return
                    else:
                        final_message = f"❌ Página mudou para URL inesperada após 'Cadastre-se': {self.driver.current_url}"
                        self.finished.emit(final_message); return


            if self._stop: final_message = f"🛑 {self.username} parado antes de preencher data."; self.finished.emit(final_message); return

            self.status.emit(f"🎂 Preenchendo data de nascimento ({self.username})...")
            wait.until(EC.presence_of_element_located((By.XPATH, "//select[@title='Dia:' or @title='Day:']")))
            Select(self.driver.find_element(By.XPATH, "//select[@title='Dia:' or @title='Day:']")).select_by_value(str(self.data_nascimento["dia"]))
            Select(self.driver.find_element(By.XPATH, "//select[@title='Mês:' or @title='Month:']")).select_by_value(str(self.data_nascimento["mes"]))
            Select(self.driver.find_element(By.XPATH, "//select[@title='Ano:' or @title='Year:']")).select_by_value(str(self.data_nascimento["ano"]))
            self.status.emit(f"🗓️ Data OK ({self.username}).")
            QThread.msleep(random.randint(1000, 2500))

            if self._stop: final_message = f"🛑 {self.username} parado antes do 2º clique."; self.finished.emit(final_message); return

            next_button_dob = None
            dob_next_selectors = [
                (By.XPATH, "//button[contains(., 'Avançar') or contains(., 'Next')]"),
                (By.CSS_SELECTOR, "button._acan._acap._acas._aj1-")
            ]
            self.status.emit(f"⏳ Procurando 'Avançar' (data) para {self.username}...")
            for i, selector_tuple in enumerate(dob_next_selectors):
                if self._stop: break
                try:
                    next_button_dob = wait.until(EC.element_to_be_clickable(selector_tuple))
                    if next_button_dob: self.status.emit(f"✅ 'Avançar' (data) encontrado ({self.username})."); break
                except: self.status.emit(f"⚠️ Seletor {i+1} (data) falhou para {self.username}.")

            if not next_button_dob or self._stop :
                final_message = f"❌ Botão 'Avançar' (data) não encontrado ou processo parado para {self.username}."
                self.finished.emit(final_message); return

            next_button_dob.click()
            self.status.emit(f"🖱️ Clicado em 'Avançar' (data) ({self.username}).")

            if self._stop: final_message = f"🛑 {self.username} parado antes de buscar código."; self.finished.emit(final_message); return

            codigo_a_inserir = None
            if self.consultar_email_auto:
                start_check_time = datetime.now(timezone('America/Sao_Paulo'))
                self.status.emit(f"⏳ [Auto] Aguardando código de verificação para {self.username} (a partir de {start_check_time.strftime('%H:%M:%S')})...")
                codigo_a_inserir = self.verificar_email_hostinger(start_check_time)
            else:
                self.status.emit(f"⏸️ [Manual] Aguardando código para {self.username}. Por favor, insira no campo da interface.")
                self.codigo_manual_necessario.emit(self.username)
                self.mutex.lock()
                self._paused = True
                while self._paused:
                    self.condition.wait(self.mutex)
                codigo_a_inserir = self.codigo_recebido_manualmente
                self.mutex.unlock()
                if not codigo_a_inserir:
                    final_message = f"🛑 {self.username} parado enquanto aguardava código manual."
                    self.finished.emit(final_message); return
                self.status.emit(f"⌨️ Código manual {codigo_a_inserir} recebido.")

            if self._stop: final_message = f"🛑 {self.username} parado durante/após busca/espera de código."; self.finished.emit(final_message); return

            if codigo_a_inserir:
                self.status.emit(f"✉️ Código {codigo_a_inserir} obtido. Inserindo ({self.username})...")
                codigo_input_element = None
                code_input_selectors = [
                    (By.NAME, "email_confirmation_code"),
                    (By.XPATH, "//input[@aria-label='Código de confirmação' or @aria-label='Confirmation Code']"),
                    (By.XPATH, "//input[contains(@name, 'confirmation_code')]")
                ]
                for i, selector_tuple in enumerate(code_input_selectors):
                    if self._stop: break
                    try:
                        codigo_input_element = wait.until(EC.presence_of_element_located(selector_tuple))
                        if codigo_input_element: self.status.emit(f"✅ Campo de código encontrado ({self.username})."); break
                    except: self.status.emit(f"⚠️ Seletor {i+1} (campo código) falhou para {self.username}.")

                if not codigo_input_element or self._stop:
                    final_message = f"❌ Campo de código não encontrado ou processo parado para {self.username}."
                    self.finished.emit(final_message); return

                codigo_input_element.send_keys(codigo_a_inserir)
                self.status.emit(f"⌨️ Código inserido ({self.username}).")
                QThread.msleep(random.randint(1000, 2500))

                if self._stop: final_message = f"🛑 {self.username} parado antes da confirmação final."; self.finished.emit(final_message); return
                self.status.emit(f"🖱️ Tentando clicar em Confirmar/Avançar final ({self.username}).")

                try: # [REMOVIDO SCROLL]; QThread.msleep(500)
                    pass
                except: pass

                botao_confirmar_final = None
                confirm_button_selector_principal = (By.XPATH, "//div[@role='button'][normalize-space()='Avançar' or normalize-space()='Next']")

                self.status.emit(f"⏳ Aguardando botão de confirmação final com seletor principal ({self.username})...")
                try:
                    botao_confirmar_final = WebDriverWait(self.driver, 15).until(
                        EC.element_to_be_clickable(confirm_button_selector_principal)
                    )
                    if botao_confirmar_final:
                        self.status.emit(f"✅ Botão final encontrado com seletor principal ({self.username}).")
                except TimeoutException:
                    self.status.emit(f"⚠️ Seletor principal (botão final) falhou para {self.username}. Tentando fallback...")
                    confirm_button_selector_fallback = (By.CSS_SELECTOR, "button[type='submit']")
                    try:
                        botao_confirmar_final = WebDriverWait(self.driver, 10).until(
                            EC.element_to_be_clickable(confirm_button_selector_fallback)
                        )
                        if botao_confirmar_final:
                            self.status.emit(f"✅ Botão final encontrado com seletor fallback ({self.username}).")
                    except TimeoutException:
                        self.status.emit(f"⚠️ Seletor fallback (botão final) também falhou para {self.username}.")

                if self._stop: final_message = f"🛑 {self.username} parado antes do clique final."; self.finished.emit(final_message); return

                if botao_confirmar_final:
                    self.status.emit(f"👍 Botão final OK. Clicando ({self.username})...")
                    clicked_successfully = False
                    try:
                        botao_confirmar_final.click()
                        self.status.emit(f"🎉 Clique direto OK ({self.username}).")
                        clicked_successfully = True
                    except Exception as e_click:
                        self.status.emit(f"⚠️ Clique direto falhou ({self.username}): {e_click}. Tentando JS...")
                        try:
                            self.driver.execute_script("arguments[0].click();", botao_confirmar_final)
                            self.status.emit(f"🎉 Clique JS OK ({self.username}).")
                            clicked_successfully = True
                        except Exception as e_js_click:
                            self.status.emit(f"❌ Clique JS falhou ({self.username}): {e_js_click}")

                    if clicked_successfully:
                        QThread.msleep(4000)
                        current_url_lower = self.driver.current_url.lower()

                        try:
                            error_element = WebDriverWait(self.driver, 3).until(
                                EC.presence_of_element_located((By.XPATH, "//*[contains(text(),'código de confirmação incorreto') or contains(text(),'confirmation code was incorrect') or contains(text(),'código inserido está incorreto') or contains(text(),'code you entered was incorrect')]"))
                            )
                            if error_element:
                                self.status.emit(f"❌ Erro do Instagram: Código de confirmação incorreto para {self.username}.")
                                final_message = f"❌ Falha na criação de {self.username}: Código incorreto."
                        except TimeoutException:
                            if "challenge" in current_url_lower or "error" in current_url_lower or "checkpoint" in current_url_lower :
                                self.status.emit(f"⚠️ Conta {self.username} pode ter caído em desafio/erro após confirmação.")
                                final_message = f"⚠️ Conta {self.username} criada, mas requer verificação adicional."
                            else:
                                conta_confirmada_com_sucesso = True
                                self.status.emit(f"✅ Conta {self.username} confirmada com sucesso!")
                                self._salvar_conta_criada()

                                self.status.emit(f"ℹ️ Tentando dispensar pop-ups pós-criação para {self.username}...")
                                popups_xpath = [
                                    "//button[text()='Agora não']",
                                    "//button[text()='Not Now']",
                                    "//button[contains(text(),'Pular')]",
                                    "//button[contains(text(),'Skip')]"
                                ]
                                for xpath in popups_xpath:
                                    if self._stop: break
                                    try:
                                        popup_button = WebDriverWait(self.driver, 3).until(EC.element_to_be_clickable((By.XPATH, xpath)))
                                        popup_button.click()
                                        self.status.emit(f"🖱️ Pop-up '{xpath}' dispensado.")
                                        QThread.msleep(1000)
                                    except:
                                        pass
                                if self._stop:
                                    final_message = f"🛑 {self.username} parado após dispensar popups."
                                else:
                                    foto_atualizada = False
                                    if self.ativar_foto_perfil:
                                        self.status.emit(f"⏳ Aguardando 5 segundos antes de tentar adicionar foto para {self.username}...")
                                        QThread.msleep(5000)
                                        if not self._stop:
                                            foto_atualizada = self._tentar_atualizar_foto_perfil(wait)
                                        else: final_message = f"🛑 {self.username} parado antes de adicionar foto."

                                    bio_preenchida = False
                                    fotos_postadas = 0

                                    if not self._stop: # Só continua se não foi parado
                                        if self.ativar_bio or self.ativar_posts: # Precisa atualizar/esperar se for fazer bio ou post
                                            self.status.emit(f"🔄 Atualizando página para {self.username} antes de bio/posts...")
                                            try:
                                                self.driver.refresh()
                                                self.status.emit(f"⏳ Aguardando 7 segundos após atualização para {self.username}...")
                                                QThread.msleep(7000)
                                            except Exception as e_refresh:
                                                self.status.emit(f"⚠️ Erro ao atualizar página: {e_refresh}")

                                        if not self._stop and self.ativar_bio:
                                            bio_preenchida = self._tentar_preencher_biografia(wait)
                                            QThread.msleep(1000)

                                        if not self._stop and self.ativar_posts:
                                            fotos_postadas = self._tentar_postar_fotos(wait)
                                            QThread.msleep(1000)

                                    final_message = f"✅ Conta {self.username} criada e salva."
                                    if self.ativar_foto_perfil: # Checa se a *opção* estava ativa
                                        final_message += " Foto perfil OK." if foto_atualizada else " Foto perfil falhou/não definida."
                                    if self.ativar_bio: # Checa se a *opção* estava ativa
                                        final_message += " Bio OK." if bio_preenchida else " Bio falhou/não definida."
                                    if self.ativar_posts: # Checa se a *opção* estava ativa
                                        if fotos_postadas > 0: final_message += f" {fotos_postadas} foto(s) postada(s)."
                                        else: final_message += " Nenhuma foto postada."
                    else:
                        final_message = f"❌ Erro ao clicar em 'Confirmar' para {self.username} (ambos métodos falharam)."
                else:
                    final_message = f"❌ Botão de confirmação final não encontrado para {self.username}."
            else:
                final_message = f"⚠️ Código não recebido ou não encontrado a tempo para {self.username}. Não foi possível confirmar."

        except TimeoutException as e:
            self.status.emit(f"❌ Timeout ({self.username}): {str(e).splitlines()[0]}")
            final_message = f"❌ Timeout durante a criação da conta {self.username}."
        except NoSuchElementException as e:
            self.status.emit(f"❌ Elemento não encontrado ({self.username}): {str(e).splitlines()[0]}")
            final_message = f"❌ Elemento não encontrado para {self.username}."
        except Exception as e:
            self.status.emit(f"❌ Erro inesperado ({self.username}): {e}")
            final_message = f"❌ Erro inesperado para {self.username}: {e}"
        finally:
            if self.driver:
                # Salvar cookies otimizados se a conta foi criada com sucesso
                if final_message.startswith("✅ Conta"):
                    try:
                        cookies = self.driver.get_cookies()
                        if cookies:
                            self.cookies_optimizer.salvar_cookies(self.username, cookies)
                            self.status.emit(f"🍪 Cookies salvos para {self.username} em sessions_otimizadas.")
                    except Exception as e:
                        self.status.emit(f"⚠️ Erro ao salvar cookies otimizados para {self.username}: {e}")
                try:
                    self.driver.delete_all_cookies() # Limpa cookies antes de fechar
                    self.status.emit(f"🍪 Cookies limpos para {self.username} no final.")
                    self.driver.quit()
                    self.status.emit(f"🚪 Navegador fechado para {self.username} (final do processo).")
                except Exception as e:
                    self.status.emit(f"⚠️ Erro ao limpar cookies/fechar navegador no finally ({self.username}): {e}).")

            if self._stop and final_message.startswith("⚠️ Processo para"):
                final_message = f"🛑 Processo para {self.username} interrompido pelo usuário."

            self.finished.emit(final_message)
