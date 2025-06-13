import os
import json
import time
import traceback
import datetime
import random

try:
    import pyperclip
except ImportError:
    pyperclip = None

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException, NoSuchElementException

COOKIES_DIR = "cookies"
if not os.path.exists(COOKIES_DIR):
    os.makedirs(COOKIES_DIR)

CHROMEDRIVER_PATH = "chromedriver.exe"

def salvar_snapshot_debug(driver, prefixo):
    """Salva o HTML da página atual para fins de depuração."""
    now = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = f"debug_{prefixo}_{now}.html"
    try:
        with open(filename, "w", encoding="utf-8") as f:
            f.write(driver.page_source)
        print(f"[DEBUG] Snapshot da página salvo em: {filename}")
    except Exception as e:
        print(f"[ERRO] Não foi possível salvar o snapshot de debug: {e}")

def salvar_cookies(driver, usuario):
    """Salva os cookies de sessão para evitar logins repetidos."""
    cookies_path = os.path.join(COOKIES_DIR, f"{usuario}.json")
    with open(cookies_path, 'w') as file:
        json.dump(driver.get_cookies(), file)

def carregar_cookies(driver, usuario):
    """Carrega os cookies de uma sessão anterior."""
    cookies_path = os.path.join(COOKIES_DIR, f"{usuario}.json")
    if os.path.exists(cookies_path):
        with open(cookies_path, 'r') as file:
            cookies = json.load(file)
            for cookie in cookies:
                driver.add_cookie(cookie)
        return True
    return False

def comentar_post(usuario, senha, link, comentario):
    """Faz login, acessa o post e comenta usando Selenium de forma robusta."""
    chrome_options = Options()
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--window-size=1920,1080')

    driver = None
    try:
        service = Service(CHROMEDRIVER_PATH)
        driver = webdriver.Chrome(service=service, options=chrome_options)
    except Exception as e:
        return False, f"Erro ao iniciar ChromeDriver: {str(e)}"

    try:
        driver.get("https://www.instagram.com/")
        time.sleep(3)
        if carregar_cookies(driver, usuario):
            driver.refresh()
            time.sleep(3)

        if "login" in driver.current_url:
            try:
                user_input = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.NAME, "username")))
                pass_input = driver.find_element(By.NAME, "password")
                user_input.send_keys(usuario)
                pass_input.send_keys(senha)
                pass_input.send_keys(Keys.RETURN)
                WebDriverWait(driver, 10).until_not(EC.url_contains('login'))
                salvar_cookies(driver, usuario)
            except TimeoutException:
                return False, "Login inválido ou a página não carregou a tempo."

        driver.get(link)
        WebDriverWait(driver, 10).until(EC.url_contains('p/'))

        print("[BOT] Página do post carregada. Procurando por pop-ups...")
        popups_xpaths = [
            "//button[text()='Agora não']",
            "//button[text()='Not now']",
            "//div[@role='dialog']//button[contains(text(), 'Agora não') or contains(text(), 'Not Now')]"
        ]
        for xpath in popups_xpaths:
            try:
                popup_button = WebDriverWait(driver, 3).until(EC.element_to_be_clickable((By.XPATH, xpath)))
                popup_button.click()
                print("[BOT] Pop-up indesejado fechado.")
                time.sleep(1)
            except Exception:
                pass

        # NOVO: Tentar até 10 vezes encontrar e clicar no campo de comentário
        max_tentativas = 10
        tentativa = 0
        sucesso = False
        while tentativa < max_tentativas:
            tentativa += 1
            print(f"[BOT] Tentativa {tentativa}/{max_tentativas} de encontrar e clicar no campo de comentário...")
            try:
                comment_area = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.XPATH, '//*[@aria-label="Adicione um comentário..."]'))
                )
                driver.execute_script("arguments[0].focus();", comment_area)
                driver.execute_script("arguments[0].click();", comment_area)
                print("[BOT] Campo de comentário clicado com sucesso!")
                time.sleep(0.5)
                sucesso = True
                break
            except Exception as e:
                print(f"[ERRO] Não foi possível clicar no campo de comentário na tentativa {tentativa}: {e}")
                time.sleep(1)
        if not sucesso:
            print(f"[ERRO] Não foi possível clicar no campo de comentário após {max_tentativas} tentativas.")
            return False, f"Não foi possível clicar no campo de comentário após {max_tentativas} tentativas."

        # Agora segue o fluxo de colar/digitar e postar
        print(f"[BOT] Campo de comentário localizado. Enviando o comentário: '{comentario}'")
        try:
            colado = False
            if pyperclip is not None:
                try:
                    pyperclip.copy(comentario)
                    comment_area.send_keys(Keys.CONTROL, 'v')
                    print("[BOT] Comentário colado via Ctrl+V.")
                    colado = True
                    time.sleep(0.5)
                except Exception as e:
                    print(f"[BOT] Falha ao colar via Ctrl+V: {e}")
            if not colado:
                print("[BOT] Comentário será digitado caractere por caractere.")
                for char in comentario:
                    comment_area.send_keys(char)
                    time.sleep(random.uniform(0.1, 0.3))
            print("[BOT] Comentário enviado para o campo.")
            time.sleep(0.5)
            postar_btn = driver.find_element(By.XPATH, '//*[@role="button" and contains(text(),"Postar")]')
            print("[BOT] Botão 'Postar' encontrado.")
            driver.execute_script("arguments[0].click();", postar_btn)
            print("[BOT] Comentário enviado clicando no botão 'Postar'.")
            time.sleep(2)
        except Exception as e:
            error_msg = f"Falha ao tentar injetar ou enviar o comentário: {e}"
            print(f"[ERRO] {error_msg}")
            return False, error_msg
        # Etapa 4: VERIFICAR se o comentário foi realmente postado
        print("[BOT] Verificando se o comentário foi postado (aguardando até 15 segundos)...")
        try:
            comment_xpath = f"//span[contains(text(), \"{comentario}\")]"
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.XPATH, comment_xpath))
            )
            print(f"[SUCESSO] Verificação confirmada! Comentário '{comentario}' está na página.")
            return True, f"Comentário '{comentario}' enviado e verificado com sucesso."
        except TimeoutException:
            error_msg = "Falha na verificação: O comentário não foi encontrado na página após o envio."
            print(f"[ERRO] {error_msg}")
            return False, error_msg

    except Exception as e:
        error_msg = f"Erro inesperado durante a automação: {str(e)}"
        print(f"[BOT] {error_msg}")
        print(traceback.format_exc())
        return False, error_msg
    finally:
        if driver:
            print("[BOT] Operação finalizada. Encerrando o driver.")
            driver.quit()


def curtir_post(usuario, senha, link):
    """Faz login, acessa o post e curte usando Selenium."""
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    print("[DEBUG] Iniciando processo de curtir_post...")
    chrome_options = Options()
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--window-size=1920,1080')
    try:
        print("[DEBUG] Iniciando ChromeDriver...")
        service = Service(CHROMEDRIVER_PATH)
        driver = webdriver.Chrome(service=service, options=chrome_options)
    except Exception as e:
        print(f"[ERRO] Falha ao iniciar ChromeDriver: {str(e)}")
        return False, f"Erro ao iniciar ChromeDriver: {str(e)}"
    try:
        print("[DEBUG] Acessando Instagram...")
        driver.get("https://www.instagram.com/")
        time.sleep(3)
        # Tenta carregar cookies
        print("[DEBUG] Tentando carregar cookies...")
        cookies_ok = carregar_cookies(driver, usuario)
        if cookies_ok:
            print("[DEBUG] Cookies carregados, atualizando página...")
            driver.refresh()
            time.sleep(3)
        # Se não estiver logado, faz login
        if "login" in driver.current_url:
            print("[DEBUG] Fazendo login manual...")
            user_input = driver.find_element(By.NAME, "username")
            pass_input = driver.find_element(By.NAME, "password")
            user_input.send_keys(usuario)
            pass_input.send_keys(senha)
            pass_input.send_keys(Keys.RETURN)
            time.sleep(5)
            if "login" in driver.current_url:
                print("[ERRO] Login inválido ao curtir.")
                # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
                return False, "Login inválido ao curtir."
            print("[DEBUG] Login realizado com sucesso, salvando cookies...")
            salvar_cookies(driver, usuario)
        print(f"[DEBUG] Indo para o link do post: {link}")
        driver.get(link)
        time.sleep(4)
        try:
            wait = WebDriverWait(driver, 15)
            # Tenta encontrar o botão de curtir em português ou inglês
            seletores = [
                '//span[@aria-label="Curtir"]/ancestor::button',
                '//span[@aria-label="Like"]/ancestor::button',
                '//div[@role="button"]//span//*[local-name()="svg" and @aria-label="Curtir"]/ancestor::button',
                '//div[@role="button"]//span//*[local-name()="svg" and @aria-label="Like"]/ancestor::button',
                '//div[@role="button" and .//span[contains(text(),"Curtir")]]',
                '//button//*[local-name()="svg" and (@aria-label="Curtir" or @aria-label="Like")]/ancestor::button',
                '//button[@aria-pressed="false"]',
                '//button[contains(@class,"wpO6b")]//span[@aria-label="Curtir"]/ancestor::button',
                '//button[contains(@class,"wpO6b")]//span[@aria-label="Like"]/ancestor::button',
                '//section//button',
                '//div[contains(@class,"x1i10hfl") and @role="button"]',
                "//svg[@aria-label='Curtir']/ancestor::div[@role='button']",
                "//svg[title='Curtir']/ancestor::div[@role='button']",
                "//svg[@aria-label='Curtir']",
                "//svg[@aria-label='Curtir']/path",
                "//svg/path[@d='M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z']",
                "//path[@d='M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z']"
            ]
            like_btn = None
            for sel in seletores:
                print(f"[DEBUG] Tentando seletor: {sel}")
                try:
                    like_btn = wait.until(EC.element_to_be_clickable((By.XPATH, sel)))
                    if like_btn:
                        print(f"[DEBUG] Botão encontrado pelo seletor: {sel}")
                        # Verifica se é realmente o botão de curtir (não story, não compartilhamento, etc)
                        svg = None
                        try:
                            svg = like_btn.find_element(By.XPATH, ".//svg[@aria-label='Curtir' or @aria-label='Like']")
                        except Exception:
                            pass
                        if svg:
                            # Verifica se já está curtido (ícone preenchido, geralmente fill diferente de 'currentColor')
                            fill = svg.get_attribute("fill")
                            print(f"[DEBUG] SVG fill: {fill}")
                            if fill and fill != "currentColor":
                                print("[INFO] Post já está curtido, não será clicado novamente.")
                                # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
                                return True, "Post já estava curtido."
                            else:
                                print("[DEBUG] Botão parece não estar curtido, prosseguindo para clicar.")
                            break
                        else:
                            # Se não achar SVG, tenta garantir que não é outro botão genérico
                            btn_aria = like_btn.get_attribute('aria-label')
                            if btn_aria and btn_aria.lower() in ["curtir", "like"]:
                                print("[DEBUG] Botão com aria-label correto encontrado.")
                                break
                            else:
                                print("[DEBUG] Elemento encontrado não parece ser botão de curtir, continuando busca...")
                                like_btn = None
                except Exception as e:
                    print(f"[DEBUG] Seletor falhou: {sel} | Erro: {e}")
                    continue
            if not like_btn:
                print("[ERRO] Botão de curtir não encontrado após testar todos os seletores. Listando botões para debug:")
                # Listar todos os botões para debug
                botoes = driver.find_elements(By.TAG_NAME, 'button')
                for i, btn in enumerate(botoes):
                    try:
                        txt = btn.text
                    except Exception:
                        txt = ''
                    try:
                        aria = btn.get_attribute('aria-label')
                    except Exception:
                        aria = ''
                    try:
                        classes = btn.get_attribute('class')
                    except Exception:
                        classes = ''
                    print(f"[DEBUG] Botão {i}: texto='{txt}', aria-label='{aria}', classes='{classes}'")
                # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
                return False, "Botão de curtir não encontrado (vários seletores testados)."
            print("[DEBUG] Clicando no botão de curtir...")
            like_btn.click()
            time.sleep(2)
            # Verifica se o botão mudou de estado após o clique
            try:
                svg = like_btn.find_element(By.XPATH, ".//svg[@aria-label='Curtir' or @aria-label='Like']")
                fill = svg.get_attribute("fill")
                print(f"[DEBUG] SVG fill após clique: {fill}")
                if fill and fill != "currentColor":
                    print("[SUCESSO] Post curtido com sucesso.")
                    # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
                    return True, "Post curtido com sucesso."
                else:
                    print("[ERRO] O botão não mudou para o estado curtido após o clique.")
                    # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
                    return False, "Cliquei, mas o botão não mudou para curtido. Pode não ser o botão correto."
            except Exception as e:
                print(f"[ERRO] Não foi possível verificar o estado do botão após o clique: {e}")
                # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
                return False, "Cliquei, mas não consegui verificar se curtiu mesmo."

        except Exception as e:
            print(f"[ERRO] Erro ao encontrar/clicar no botão de curtir: {str(e)}")
            # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
            return False, f"Erro ao curtir: {str(e)}"
    except Exception as e:
        print(f"[ERRO] Erro inesperado: {str(e)}")
        # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
        return False, f"Erro inesperado: {str(e)}"

def checar_chromedriver():
    if not os.path.exists(CHROMEDRIVER_PATH):
        return False
    return True


def salvar_json(usuario, dados):
    """Salva os dados do usuário em um arquivo .json."""
    filename = f"{usuario}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=4)


def salvar_cookies(driver, usuario):
    """Salva os cookies do usuário para login futuro."""
    cookies = driver.get_cookies()
    with open(os.path.join(COOKIES_DIR, f"{usuario}.json"), "w", encoding="utf-8") as f:
        json.dump(cookies, f, ensure_ascii=False, indent=4)


def carregar_cookies(driver, usuario):
    """Carrega cookies salvos para o usuário, se existirem."""
    path = os.path.join(COOKIES_DIR, f"{usuario}.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            cookies = json.load(f)
        for cookie in cookies:
            driver.add_cookie(cookie)
        return True
    return False


def login_instagram(usuario, senha, headless=True):
    """
    Realiza login no Instagram, salva cookies e credenciais em .json.
    Só fecha o navegador após login bem-sucedido, cookies criados e challenge (se houver) resolvido.
    """
    if not checar_chromedriver():
        return False, "chromedriver.exe não encontrado. Baixe em: https://chromedriver.chromium.org/downloads e coloque na pasta do bot."
    chrome_options = Options()
    if headless:
        chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--window-size=1920,1080')
    try:
        service = Service(CHROMEDRIVER_PATH)
        driver = webdriver.Chrome(service=service, options=chrome_options)
    except Exception as e:
        return False, f"Erro ao iniciar ChromeDriver: {str(e)}"
    driver.get("https://www.instagram.com/")
    time.sleep(3)

    # Tenta carregar cookies
    cookies_ok = carregar_cookies(driver, usuario)
    if cookies_ok:
        driver.refresh()
        time.sleep(3)
        # Se ainda está NA TELA DE LOGIN, precisa logar manualmente
        if "login" in driver.current_url:
            pass  # Segue para login manual abaixo
        else:
            # Verifica se caiu no challenge do Instagram
            if "/challenge" in driver.current_url:
                try:
                    from selenium.webdriver.support.ui import WebDriverWait
                    from selenium.webdriver.support import expected_conditions as EC
                    wait = WebDriverWait(driver, 10)
                    ignorar_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(),'Ignorar')]")))
                    ignorar_btn.click()
                    time.sleep(2)
                except Exception as e:
                    # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
                    return False, f"Challenge detectado, mas não foi possível clicar em Ignorar: {str(e)}"
            # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
            return True, "Login com cookies bem-sucedido."

    try:
        user_input = driver.find_element(By.NAME, "username")
        pass_input = driver.find_element(By.NAME, "password")
        user_input.send_keys(usuario)
        pass_input.send_keys(senha)
        pass_input.send_keys(Keys.RETURN)
        time.sleep(5)
        # Se cair no challenge após login
        if "/challenge" in driver.current_url:
            try:
                from selenium.webdriver.support.ui import WebDriverWait
                from selenium.webdriver.support import expected_conditions as EC
                wait = WebDriverWait(driver, 10)
                ignorar_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(),'Ignorar')]")))
                ignorar_btn.click()
                time.sleep(2)
            except Exception as e:
                # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
                return False, f"Challenge detectado após login, mas não foi possível clicar em Ignorar: {str(e)}"
        if "login" in driver.current_url:
            # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
            return False, "Usuário ou senha inválidos."
        salvar_cookies(driver, usuario)
        salvar_json(usuario, {"usuario": usuario, "senha": senha})
        # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
        return True, "Login realizado e cookies salvos."
    except NoSuchElementException:
        # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
        return False, "Erro ao localizar campos de login."
    except Exception as e:
        # driver.quit()  # Removido conforme solicitado: fechamento manual apenas
        return False, f"Erro inesperado: {str(e)}"

