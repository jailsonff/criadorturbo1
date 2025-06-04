from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from webdriver_manager.chrome import ChromeDriverManager
import time
import json

def remove_non_bmp(text):
    return ''.join(c for c in text if ord(c) <= 0xFFFF)

class InstagramBot:
    COMMENT_BOX_XPATH = '//textarea[@aria-label="Adicione um comentário..."]'
    SEND_BUTTON_XPATH = '//button[contains(@type, "submit") and (text()="Publicar" or @aria-label="Publicar")]'
    AVATAR_XPATH = '//img[contains(@alt, "Foto do perfil") or contains(@alt, "profile picture")]'
    NEW_POST_XPATH = '//svg[@aria-label="Nova publicação" or @aria-label="New post"]'

    def __init__(self, headless=True):
        options = webdriver.ChromeOptions()
        if headless:
            options.add_argument('--headless')
        options.add_argument('--disable-blink-features=AutomationControlled')
        self.driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)

    def login_with_cookies(self, username, cookies):
        self.driver.get('https://www.instagram.com/')
        time.sleep(3)
        self.driver.delete_all_cookies()
        for cookie in cookies:
            if 'sameSite' in cookie:
                cookie.pop('sameSite')
            self.driver.add_cookie(cookie)
        self.driver.refresh()
        time.sleep(3)

    def login(self, username, password, cookies_folder=None):
        self.driver.get('https://www.instagram.com/accounts/login/')
        time.sleep(3)
        user_input = self.driver.find_element(By.NAME, 'username')
        pass_input = self.driver.find_element(By.NAME, 'password')
        user_input.send_keys(username)
        pass_input.send_keys(password)
        pass_input.send_keys(Keys.RETURN)
        time.sleep(5)
        # Após login, salva os cookies se cookies_folder fornecido
        if cookies_folder:
            self.save_cookies(username, cookies_folder)

    def comment_post(self, post_url, comment):
        from selenium.common.exceptions import StaleElementReferenceException, NoSuchElementException, ElementClickInterceptedException
        self.driver.get(post_url)
        time.sleep(5)
        
        # Desativar animações e rolagem suave para evitar problemas
        self.driver.execute_script("""
            document.querySelector('html').style.scrollBehavior = 'auto';
            try {
                // Desativar animações
                const styleSheet = document.createElement('style');
                styleSheet.textContent = '* { transition: none !important; animation: none !important; scroll-behavior: auto !important; }';
                document.head.appendChild(styleSheet);
                
                // Desativar eventos de scroll
                window._scrollEnabled = false;
                const originalScrollTo = window.scrollTo;
                window.scrollTo = function() {
                    if (window._scrollEnabled) return originalScrollTo.apply(this, arguments);
                };
            } catch (e) { console.error('Erro ao desativar animações:', e); }
        """)
        
        attempts = 0
        max_attempts = 5  # Aumentado para 5 tentativas
        
        while attempts < max_attempts:
            try:
                # Localizando o campo de comentário sem rolar
                comment_box = self.driver.find_element(By.XPATH, self.COMMENT_BOX_XPATH)
                
                # Posição do elemento antes de qualquer interação
                position_before = self.driver.execute_script("return window.pageYOffset;")
                
                # Fixar a página na posição atual para evitar rolagem automática
                self.driver.execute_script("""
                    // Fixar posição da página
                    document.body.style.overflow = 'hidden';
                    document.body.style.position = 'fixed';
                    document.body.style.width = '100%';
                    
                    // Posicionar o elemento visível sem animação
                    let elem = arguments[0];
                    let rect = elem.getBoundingClientRect();
                    if (rect.bottom > window.innerHeight || rect.top < 0) {
                        window._scrollEnabled = true;
                        window.scrollTo(0, elem.offsetTop - 200);
                        window._scrollEnabled = false;
                    }
                """, comment_box)
                
                time.sleep(1)
                
                # Tenta fechar overlays genéricos (cookies, banners, etc)
                try:
                    close_btn = self.driver.find_element(By.XPATH, '//button[contains(text(),"Aceitar") or contains(text(),"Accept") or contains(text(),"OK")]')
                    close_btn.click()
                    time.sleep(1)
                except Exception:
                    pass
                
                # Aguarda o campo estar clicável
                from selenium.webdriver.support.ui import WebDriverWait
                from selenium.webdriver.support import expected_conditions as EC
                WebDriverWait(self.driver, 10).until(EC.element_to_be_clickable((By.XPATH, self.COMMENT_BOX_XPATH)))
                
                # Verificar se a página rolou e restaurar posição se necessário
                position_after = self.driver.execute_script("return window.pageYOffset;")
                if position_before != position_after:
                    self.driver.execute_script(f"window._scrollEnabled = true; window.scrollTo(0, {position_before}); window._scrollEnabled = false;")
                    time.sleep(0.5)  # Breve pausa para estabilização
                
                # Re-obtem o campo de comentário após possíveis mudanças
                comment_box = self.driver.find_element(By.XPATH, self.COMMENT_BOX_XPATH)
                comment_box.click()
                
                # Remove caracteres fora do BMP
                safe_comment = remove_non_bmp(comment)
                comment_box.send_keys(safe_comment)
                time.sleep(0.5)  # Pequena pausa antes de enviar
                comment_box.send_keys(Keys.RETURN)
                
                # Aguardar exatamente 5 segundos após comentar, conforme solicitado pelo usuário
                time.sleep(5)
                
                # Restaurar configurações da página
                self.driver.execute_script("""
                    document.body.style.overflow = '';
                    document.body.style.position = '';
                    document.body.style.width = '';
                    window._scrollEnabled = true;
                """)
                
                print(f"Comentário enviado com sucesso: {safe_comment[:30]}...")
                return True
                
            except (StaleElementReferenceException, NoSuchElementException, ElementClickInterceptedException) as e:
                attempts += 1
                print(f"Tentativa {attempts}/{max_attempts} falhou: {str(e)[:100]}")
                time.sleep(2)
                
                if attempts == max_attempts:
                    # Restaurar configurações da página mesmo em caso de erro
                    self.driver.execute_script("""
                        document.body.style.overflow = '';
                        document.body.style.position = '';
                        document.body.style.width = '';
                        window._scrollEnabled = true;
                    """)
                    raise Exception(f'Erro ao tentar comentar após {max_attempts} tentativas: {e}')
        
        return False

    def is_logged_in(self):
        from selenium.common.exceptions import NoSuchElementException
        self.driver.get('https://www.instagram.com/')
        time.sleep(3)
        try:
            # Tenta encontrar o avatar do usuário
            self.driver.find_element(By.XPATH, self.AVATAR_XPATH)
            return True
        except NoSuchElementException:
            pass
        try:
            # Tenta encontrar o botão de nova publicação
            self.driver.find_element(By.XPATH, self.NEW_POST_XPATH)
            return True
        except NoSuchElementException:
            return False

    def save_cookies(self, username, cookies_folder):
        import os
        if not os.path.exists(cookies_folder):
            os.makedirs(cookies_folder)
        cookies = self.driver.get_cookies()
        cookie_path = os.path.join(cookies_folder, f"{username}.json")
        with open(cookie_path, 'w', encoding='utf-8') as f:
            import json
            json.dump(cookies, f, ensure_ascii=False, indent=2)

    def close(self):
        self.driver.quit()
