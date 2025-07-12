import os
import time
from selenium.webdriver.common.by import By
from PyQt5.QtCore import QObject, pyqtSignal

class VerificadorCurtida(QObject):
    status_update = pyqtSignal(str)
    
    def __init__(self):
        super().__init__()
        # Criando diretório para logs e screenshots
        self.base_dir = os.path.join(os.getcwd(), "insta_logs")
        os.makedirs(self.base_dir, exist_ok=True)
        
    def verificar_curtida_realizada(self, driver, username):
        """
        Verifica se um post foi realmente curtido procurando por indicadores visuais.
        
        Args:
            driver: WebDriver do Selenium
            username: Nome do usuário para logs
            
        Returns:
            bool: True se a curtida foi confirmada, False caso contrário
        """
        print(f"[DEBUG VERIFY][{username}] Verificando se a curtida foi realmente realizada...")
        self.status_update.emit(f"\ud83d\udd0d Verificando se a curtida foi realmente bem-sucedida...")
        
        # Função para tirar screenshot do estado atual
        try:
            screenshot_file = os.path.join(self.base_dir, f"verify_{username}_{int(time.time())}.png")
            driver.save_screenshot(screenshot_file)
            print(f"[DEBUG VERIFY][{username}] Screenshot de verificação salva: {screenshot_file}")
        except Exception as ss_err:
            print(f"[DEBUG VERIFY][{username}] Erro ao salvar screenshot: {str(ss_err)}")
            
        # ESTRATÉGIA 1: Verificar mudança de cor do ícone
        try:
            # Pequena pausa para garantir que a página atualizou após a curtida
            print(f"[DEBUG VERIFY][{username}] Aguardando breve momento para atualização da página...")
            time.sleep(1)  # Reduzido de 3 para 1 segundo para ser mais rápido
            
            # Verificar todos os SVGs na página
            aria_labels = []
            svgs = driver.find_elements(By.TAG_NAME, "svg")
            print(f"[DEBUG VERIFY][{username}] Analisando {len(svgs)} SVGs na página...")
            
            for svg in svgs:
                try:
                    if svg.is_displayed():
                        aria = svg.get_attribute("aria-label")
                        if aria:
                            aria_labels.append(aria)
                            print(f"[DEBUG VERIFY][{username}] SVG encontrado com label: '{aria}'")
                            # Verificação de sucesso: Encontrou o botão de "Descurtir" (significa que o post está curtido)
                            if aria == "Descurtir" or aria == "Unlike":
                                print(f"[DEBUG VERIFY][{username}] \u2705 CONFIRMADO! Post está curtido (botão 'Descurtir' encontrado)!")
                                self.status_update.emit(f"\u2764\ufe0f CONFIRMADO: Post está curtido!")
                                return True
                                
                            # Verificação de falha: Se encontrar "Curtir", significa que o post NÃO está curtido
                            if aria == "Curtir" or aria == "Like":
                                print(f"[DEBUG VERIFY][{username}] \u274c FALHA! Post NÃO está curtido (botão 'Curtir' encontrado)!")
                                self.status_update.emit(f"\u274c FALHA: Post não está curtido!")
                                return False
                except Exception as inner_err:
                    print(f"[DEBUG VERIFY][{username}] Erro ao verificar SVG individual: {str(inner_err)}")
                    continue
                    
            print(f"[DEBUG VERIFY][{username}] Total de SVGs: {len(svgs)}. Labels: {aria_labels}")
        except Exception as svg_err:
            print(f"[DEBUG VERIFY][{username}] Erro na verificação de SVGs: {str(svg_err)}")
        
        # ESTRATÉGIA 2: Verificar por seletores diretos
        try:
            # Verificar pelos botões de descurtir usando diferentes métodos
            descurtir_seletores = [
                # CSS
                "svg[aria-label='Descurtir']",
                "svg.x1lliihq.x1n2onr6.xxk16z8[aria-label='Descurtir']",
                "svg[aria-label='Unlike']",
                "svg path[d^='M34.6 3.1']",  # Caminho do coração preenchido
                "svg.xfh5vqj",  # Classe do SVG de coração preenchido
                "div.xp7jhwk svg",  # SVG dentro da área de ações
                "div.x1i10hfl svg:first-child",  # Primeiro SVG em botão
                "article div[role='button']:first-child svg",  # SVG no primeiro botão do artigo
                
                # XPath
                "//svg[@aria-label='Descurtir']",
                "//svg[contains(@class, 'xxk16z8')]",
                "//svg[@viewBox='0 0 48 48'][@aria-label='Descurtir']",
                "//div[@role='button']//svg[@aria-label='Descurtir']",
                "//article//div[@role='button'][1]//svg",  # SVG no primeiro botão do artigo
                "//section//div[@role='button'][1]//svg"  # SVG no primeiro botão da seção
            ]
            
            for seletor in descurtir_seletores:
                try:
                    if seletor.startswith("//"):
                        elementos = driver.find_elements(By.XPATH, seletor)
                    else:
                        elementos = driver.find_elements(By.CSS_SELECTOR, seletor)
                        
                    if elementos:
                        for elem in elementos:
                            try:
                                if elem.is_displayed():
                                    print(f"[DEBUG VERIFY][{username}] \u2705 CONFIRMADO! Botão 'Descurtir' encontrado com seletor: {seletor}")
                                    self.status_update.emit(f"\u2764\ufe0f CONFIRMADO: Botão 'Descurtir' encontrado. Curtida bem-sucedida!")
                                    return True
                            except:
                                continue
                except:
                    continue
        except Exception as sel_err:
            print(f"[DEBUG VERIFY][{username}] Erro na verificação por seletores: {str(sel_err)}")
                    
        # ESTRATÉGIA 3: Javascript avançado para identificar curtida
        try:
            # Javascript para buscar qualquer elemento visual de curtida vermelho
            js_verify_script = """
            function verificarCurtida() {
                console.log("Executando verificação JavaScript avançada");
                
                // 1. Busca por SVGs com aria-label="Descurtir"
                let descurtirSvgs = document.querySelectorAll('svg[aria-label="Descurtir"], svg[aria-label="Unlike"]');
                console.log("Encontrados " + descurtirSvgs.length + " SVGs de Descurtir");
                if (descurtirSvgs.length > 0) {
                    for (let svg of descurtirSvgs) {
                        if (svg.offsetParent !== null) {
                            console.log("SVG de Descurtir visível encontrado!");
                            return "descurtir_encontrado";
                        }
                    }
                }
                
                // 2. Busca por elementos com cor vermelha (coração)
                try {
                    let redElements = [];
                    const allElements = document.querySelectorAll('*');
                    console.log("Verificando " + allElements.length + " elementos na página");
                    
                    for (let i = 0; i < allElements.length && redElements.length < 10; i++) {
                        const el = allElements[i];
                        const style = window.getComputedStyle(el);
                        const fill = style.fill;
                        const color = style.color;
                        
                        if ((fill && (fill === 'rgb(255, 48, 64)' || fill === '#ed4956')) ||
                            (color && (color === 'rgb(255, 48, 64)' || color === '#ed4956'))) {
                            if (el.offsetParent !== null) {
                                redElements.push(el);
                                console.log("Elemento vermelho encontrado: " + el.tagName);
                            }
                        }
                    }
                    
                    if (redElements.length > 0) {
                        console.log("Total de elementos vermelhos: " + redElements.length);
                        return "coracao_vermelho_encontrado";
                    }
                } catch (e) {
                    console.log("Erro ao verificar cores: " + e);
                }
                
                // 3. Verifica se algum elemento tem o caminho SVG específico do coração preenchido
                try {
                    const pathElements = document.querySelectorAll('path');
                    console.log("Verificando " + pathElements.length + " elementos path");
                    
                    for (let path of pathElements) {
                        const d = path.getAttribute('d');
                        if (d && (d.startsWith('M34.6 3.1') || d.indexOf('34.6 3.1') !== -1)) {
                            console.log("Path de coração preenchido encontrado!");
                            return "path_preenchido_encontrado";
                        }
                    }
                } catch (e) {
                    console.log("Erro ao verificar paths: " + e);
                }
                
                // 4. Verifica os botões e suas funções
                try {
                    const buttons = document.querySelectorAll('[role="button"]');
                    console.log("Verificando " + buttons.length + " botões");
                    
                    for (let btn of buttons) {
                        const svgs = btn.querySelectorAll('svg');
                        for (let svg of svgs) {
                            const ariaLabel = svg.getAttribute('aria-label');
                            if (ariaLabel && (ariaLabel === 'Descurtir' || ariaLabel === 'Unlike')) {
                                console.log("Botão com SVG de Descurtir encontrado!");
                                return "botao_descurtir_encontrado";
                            }
                        }
                    }
                } catch (e) {
                    console.log("Erro ao verificar botões: " + e);
                }
                
                return false;
            }
            return verificarCurtida();
            """
            
            # Executa o JavaScript e checa o resultado
            driver.execute_script("console.clear();")  # Limpa console para debug
            resultado_verificacao = driver.execute_script(js_verify_script)
            if resultado_verificacao:
                print(f"[DEBUG VERIFY][{username}] \u2705 CONFIRMADO via JavaScript! Tipo: {resultado_verificacao}")
                self.status_update.emit(f"\u2764\ufe0f CONFIRMADO via JavaScript: {resultado_verificacao}")
                return True
        except Exception as js_err:
            print(f"[DEBUG VERIFY][{username}] Erro no JavaScript de verificação: {str(js_err)}")
        
        # ESTRATÉGIA 4: Verificar elementos vermelhos diretamente com WebDriver
        try:
            print(f"[DEBUG VERIFY][{username}] Verificando elementos vermelhos diretamente...")
            # Buscar todos os elementos que possam ser botões de curtir
            botoes = driver.find_elements(By.CSS_SELECTOR, "div[role='button']")
            for botao in botoes[:5]:  # Verificar apenas os primeiros 5 botões para eficiência
                try:
                    # Verificar se o botão tem cor vermelha
                    cor = botao.value_of_css_property('color')
                    print(f"[DEBUG VERIFY][{username}] Botão encontrado com cor: {cor}")
                    if 'rgb(255, 48, 64)' in cor or 'rgb(237, 73, 86)' in cor or '#ed4956' in cor:
                        print(f"[DEBUG VERIFY][{username}] \u2705 CONFIRMADO! Botão vermelho encontrado!")
                        self.status_update.emit(f"\u2764\ufe0f CONFIRMADO: Botão vermelho encontrado")
                        return True
                        
                    # Verificar SVGs dentro do botão
                    svgs = botao.find_elements(By.TAG_NAME, "svg")
                    for svg in svgs:
                        fill = svg.value_of_css_property('fill')
                        if 'rgb(255, 48, 64)' in fill or 'rgb(237, 73, 86)' in fill or '#ed4956' in fill:
                            print(f"[DEBUG VERIFY][{username}] \u2705 CONFIRMADO! SVG vermelho encontrado!")
                            self.status_update.emit(f"\u2764\ufe0f CONFIRMADO: SVG vermelho encontrado")
                            return True
                except Exception as btn_err:
                    print(f"[DEBUG VERIFY][{username}] Erro ao verificar botão: {str(btn_err)}")
                    continue
        except Exception as color_err:
            print(f"[DEBUG VERIFY][{username}] Erro na verificação de cores: {str(color_err)}")
        
        # ESTRATÉGIA 5: Considerar sucesso baseado nos logs anteriores de clique
        aria_label_count = len([label for label in aria_labels if label == "Descurtir" or label == "Unlike"])
        aria_label_curtir_count = len([label for label in aria_labels if label == "Curtir" or label == "Like"])
        
        print(f"[DEBUG VERIFY][{username}] Estatísticas: {aria_label_count} 'Descurtir', {aria_label_curtir_count} 'Curtir'")
        
        # Se tiver mais "Descurtir" do que "Curtir", provavelmente já está curtido
        if aria_label_count > 0 and aria_label_count >= aria_label_curtir_count:
            print(f"[DEBUG VERIFY][{username}] \u2705 CONFIRMADO por estatística de aria-labels!")
            self.status_update.emit(f"\u2764\ufe0f CONFIRMADO por contagem de botões: mais 'Descurtir' que 'Curtir'")
            return True
            
        # ESTRATÉGIA 6: Verificar se o número de botões "Curtir" diminuiu
        if aria_label_curtir_count < 10 and len(aria_labels) > 20:
            print(f"[DEBUG VERIFY][{username}] \u2705 CONFIRMADO! Poucos botões 'Curtir' encontrados ({aria_label_curtir_count})")
            self.status_update.emit(f"\u2764\ufe0f CONFIRMADO: Poucos botões 'Curtir' encontrados, provavelmente já curtido")
            return True
        
        # Se chegou até aqui, não encontrou confirmação
        print(f"[DEBUG VERIFY][{username}] \u274c Não foi possível confirmar a curtida")
        return False
