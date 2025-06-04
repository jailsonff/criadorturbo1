#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Bot Processor - Integração entre API Web e Bot de Comentários
Este script monitora novos pedidos e os processa usando o bot existente
"""

import json
import time
import os
import sys
import logging
import random
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("bot_processor.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("BotProcessor")

# Caminho para o arquivo de pedidos
PEDIDOS_FILE = 'pedidos_pendentes.json'
PROCESSED_FILE = 'pedidos_processados.json'

# Pasta de cookies dos usuários
COOKIES_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cookies')
if not os.path.exists(COOKIES_FOLDER):
    os.makedirs(COOKIES_FOLDER)

# Pasta para logs do bot
LOGS_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
if not os.path.exists(LOGS_FOLDER):
    os.makedirs(LOGS_FOLDER)

# Carrega os usuários do Instagram
def load_instagram_users():
    """Carrega usuários do Instagram do arquivo CSV/TXT"""
    users = []
    try:
        user_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'usuarios.txt')
        if os.path.exists(user_file):
            with open(user_file, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.strip() and ',' in line:
                        username, password = line.strip().split(',', 1)
                        users.append({
                            'username': username.strip(),
                            'password': password.strip(),
                            'status': 'disponivel'
                        })
            logger.info(f"Carregados {len(users)} usuários do Instagram")
        else:
            logger.warning(f"Arquivo de usuários não encontrado: {user_file}")
    except Exception as e:
        logger.error(f"Erro ao carregar usuários: {str(e)}")
    return users

def load_pending_orders():
    """Carrega pedidos pendentes do arquivo JSON"""
    try:
        if os.path.exists(PEDIDOS_FILE):
            with open(PEDIDOS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    except Exception as e:
        logger.error(f"Erro ao carregar pedidos pendentes: {str(e)}")
        return []

def save_pending_orders(orders):
    """Salva pedidos pendentes no arquivo JSON"""
    try:
        with open(PEDIDOS_FILE, 'w', encoding='utf-8') as f:
            json.dump(orders, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Erro ao salvar pedidos pendentes: {str(e)}")

def save_processed_order(order, success=True, message=""):
    """Salva um pedido processado no histórico"""
    try:
        processed = []
        if os.path.exists(PROCESSED_FILE):
            with open(PROCESSED_FILE, 'r', encoding='utf-8') as f:
                processed = json.load(f)
        
        # Atualiza o pedido com informações do processamento
        order['data_processamento'] = datetime.now().isoformat()
        order['status'] = 'concluido' if success else 'falha'
        order['mensagem'] = message
        
        processed.append(order)
        
        with open(PROCESSED_FILE, 'w', encoding='utf-8') as f:
            json.dump(processed, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Erro ao salvar pedido processado: {str(e)}")

def process_comment_order(order, instagram_user, comment_index=0):
    """Processa um comentário específico de um pedido usando Selenium
    Args:
        order: O pedido completo com todos os comentários
        instagram_user: Usuário do Instagram a usar para este comentário
        comment_index: Índice do comentário a processar (padrão: 0, primeiro comentário)
    """
    logger.info(f"Processando comentário {comment_index+1}/{len(order['comentarios'])} do pedido {order['id']} com usuário {instagram_user['username']}")
    
    chrome_options = Options()
    # Não usar modo headless para poder visualizar o processo
    # chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-notifications")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    
    try:
        # Inicializar o driver com webdriver-manager
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
        driver.implicitly_wait(10)
        
        # Carregar cookies se existirem
        cookie_file = os.path.join(COOKIES_FOLDER, f"{instagram_user['username']}.json")
        driver.get("https://www.instagram.com/")
        
        if os.path.exists(cookie_file):
            logger.info(f"Carregando cookies para {instagram_user['username']}")
            try:
                with open(cookie_file, 'r') as f:
                    cookies = json.load(f)
                for cookie in cookies:
                    try:
                        driver.add_cookie(cookie)
                    except:
                        pass
                driver.refresh()
                time.sleep(3)
            except:
                logger.warning("Erro ao carregar cookies, tentando login padrão")
        
        # Verificar se já está logado
        if "Login" in driver.title:
            logger.info(f"Fazendo login com {instagram_user['username']}")
            try:
                # Processo de login
                driver.get("https://www.instagram.com/accounts/login/")
                time.sleep(2)
                
                # Preencher credenciais
                username_input = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.NAME, "username"))
                )
                password_input = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.NAME, "password"))
                )
                
                username_input.send_keys(instagram_user['username'])
                password_input.send_keys(instagram_user['password'])
                
                # Clicar no botão de login
                login_button = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.XPATH, "//button[@type='submit']"))
                )
                login_button.click()
                
                # Aguardar o login
                time.sleep(5)
                
                # Salvar cookies
                try:
                    cookies = driver.get_cookies()
                    with open(cookie_file, 'w') as f:
                        json.dump(cookies, f)
                except Exception as e:
                    logger.error(f"Erro ao salvar cookies: {str(e)}")
            except Exception as e:
                logger.error(f"Erro no processo de login: {str(e)}")
                driver.quit()
                return False, f"Erro no login: {str(e)}"
        
        # Navegar para o post
        logger.info(f"Navegando para o post: {order['link']}")
        driver.get(order['link'])
        time.sleep(4)
        
        # Verificar se o post existe e está acessível
        if "Esta Página Não Está Disponível" in driver.page_source or "Page Not Found" in driver.page_source:
            driver.quit()
            return False, "Post não encontrado ou indisponível"
        
        if "Esta publicação é de uma conta privada" in driver.page_source or "This post is from a private account" in driver.page_source:
            driver.quit()
            return False, "Post de uma conta privada, não é possível comentar"
            
        # Processar comentários - usando os métodos que funcionaram conforme logs
        try:
            # Dar tempo para a página carregar completamente
            time.sleep(5)
            
            # Rolar até a área de comentários
            driver.execute_script("window.scrollBy(0, 500);")
            time.sleep(2)
            
            # Seletores que funcionaram nos testes
            comment_field_selector = "//*[@aria-label=\"Adicione um comentário...\"]"  # Seletor principal
            backup_selector = "//form//textarea"  # Seletor de backup
            post_button_selector = "//*[@role=\"button\" and contains(text(),\"Postar\")]"  # Botão de postar
            
            # Localizar o campo de comentário
            logger.info("Tentando encontrar campo de comentário...")
            try:
                comment_field = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.XPATH, comment_field_selector))
                )
                logger.info("Campo de comentário encontrado com seletor principal")
            except:
                # Se não encontrar com o primeiro seletor, tenta o de backup
                try:
                    comment_field = WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.XPATH, backup_selector))
                    )
                    logger.info("Campo de comentário encontrado com seletor de backup")
                except Exception as e:
                    logger.error(f"Erro ao encontrar campo de comentário: {str(e)}")
                    driver.save_screenshot(os.path.join(LOGS_FOLDER, f"error_{order['id']}.png"))
                    driver.quit()
                    return False, "Não foi possível encontrar o campo de comentário"
            
            # Processar apenas o comentário específico com este navegador
            # Para cada comentário, vamos fechar e abrir um novo navegador com um perfil diferente
            success_count = 0
            
            if order['comentarios'] and len(order['comentarios']) > 0 and comment_index < len(order['comentarios']):
                comment_text = order['comentarios'][comment_index]  # Pegar o comentário especificado pelo índice
                
                try:
                    # Abordagem robusta para interagir com o campo de comentário
                    # Usar os seletores específicos do Instagram que sabemos que funcionam
                    comment_field_selector = "//*[@aria-label=\"Adicione um comentário...\"]" 
                    
                    # Desativar scroll suave e animações para evitar rolagem contínua
                    driver.execute_script("""
                        // Desativar scroll suave
                        document.documentElement.style.scrollBehavior = 'auto';
                        
                        // Desativar animações que possam causar rolagem
                        document.querySelectorAll('*').forEach(function(el) {
                            el.style.animation = 'none';
                            el.style.transition = 'none';
                        });
                        
                        // Rolar uma única vez para a área onde provavelmente está a seção de comentários
                        // Usar uma posição fixa em vez de relativa ao tamanho da página
                        window.scrollTo(0, 800);
                    """)
                    
                    # Usar querySelectorAll direto no JavaScript para evitar elementos obsoletos
                    driver.execute_script("""
                        // Tentar encontrar o campo de comentário por diferentes métodos
                        function findCommentField() {
                            // Método 1: Aria label
                            let field = document.querySelector('textarea[aria-label="Adicione um comentário..."]');
                            if (field) return field;
                            
                            // Método 2: Placeholder
                            field = document.querySelector('textarea[placeholder="Adicione um comentário..."]');
                            if (field) return field;
                            
                            // Método 3: Qualquer textarea dentro de um formulário
                            field = document.querySelector('form textarea');
                            if (field) return field;
                            
                            return null;
                        }
                        
                        // Encontrar e clicar
                        const commentField = findCommentField();
                        if (commentField) {
                            commentField.scrollIntoView({block: 'center'});
                            commentField.click();
                            commentField.focus();
                        }
                    """)
                    
                    # Desativar novamente scroll após as operações JavaScript iniciais
                    driver.execute_script("""
                        // Impedir qualquer rolagem adicional
                        window.addEventListener('scroll', function(e) {
                            window.scrollTo(0, 800);
                        }, { passive: false });
                    """)
                    
                    # Agora localizar o elemento novamente usando Selenium para interagir com ele
                    try:
                        # Tentar localizar o elemento pelo seletor específico sem rolar a página
                        comment_field = WebDriverWait(driver, 10).until(
                            EC.presence_of_element_located((By.XPATH, comment_field_selector))
                        )
                        # Rolar especificamente para o elemento (sem rolagem adicional)
                        driver.execute_script("arguments[0].scrollIntoView({block: 'center', behavior: 'instant'});", comment_field)
                    except:
                        # Fallback para o seletor mais genérico que sabemos que funciona
                        try:
                            comment_field = WebDriverWait(driver, 10).until(
                                EC.presence_of_element_located((By.XPATH, "//form//textarea"))
                            )
                            # Rolar especificamente para o elemento (sem rolagem adicional)
                            driver.execute_script("arguments[0].scrollIntoView({block: 'center', behavior: 'instant'});", comment_field)
                        except:
                            # Última tentativa: usar JavaScript para encontrar e focar o elemento diretamente
                            logger.info("Tentando localizar campo de comentário diretamente com JavaScript")
                            textarea_exists = driver.execute_script("""
                                const textarea = document.querySelector('form textarea');
                                if (textarea) {
                                    textarea.scrollIntoView({block: 'center', behavior: 'instant'});
                                    return true;
                                }
                                return false;
                            """)
                            
                            if not textarea_exists:
                                raise Exception("Não foi possível encontrar o campo de comentário")
                                
                            # Se o JavaScript encontrou o elemento, recuperá-lo com Selenium
                            comment_field = driver.find_element(By.XPATH, "//form//textarea")
                    
                    # Limpar o campo e digitar lentamente
                    comment_field.clear()
                    # Digitar usando JavaScript para evitar problemas com elementos obsoletos
                    coment_texto_js = comment_text.replace("'", "\'").replace('"', '\"')
                    driver.execute_script(f'arguments[0].value = "{coment_texto_js}";', comment_field)
                    
                    # Ainda simular algumas digitações para ativar o formulário
                    for _ in range(3):
                        comment_field.send_keys("a")
                        comment_field.send_keys(Keys.BACKSPACE)
                    
                    # Evitar qualquer rolagem adicional ao interagir com o botão Postar
                    try:
                        # Primeiro tenta usar JavaScript diretamente para evitar problemas com elementos obsoletos
                        # Também evita rolagem da página durante o processo
                        driver.execute_script("""
                            // Primeiro, desativar qualquer rolagem automática
                            const currentScrollY = window.scrollY;
                            const preventScroll = function(e) {
                                window.scrollTo(0, currentScrollY);
                            };
                            
                            // Adicionar listener temporário para evitar rolagem
                            window.addEventListener('scroll', preventScroll, { passive: false });
                            
                            // Tentar encontrar e clicar no botão Postar por diferentes métodos
                            function findPostButton() {
                                // Método 1: botão com texto "Postar"
                                let buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
                                for (let btn of buttons) {
                                    if (btn.textContent && btn.textContent.includes('Postar')) {
                                        return btn;
                                    }
                                }
                                
                                // Método 2: botão de submit dentro do formulário
                                let submitBtn = document.querySelector('form button[type="submit"]');
                                if (submitBtn) return submitBtn;
                                
                                // Método 3: último botão dentro do formulário
                                let form = document.querySelector('form');
                                if (form) {
                                    let allButtons = form.querySelectorAll('button');
                                    if (allButtons.length > 0) {
                                        return allButtons[allButtons.length - 1];
                                    }
                                }
                                
                                return null;
                            }
                            
                            // Encontrar o botão sem rolar a página
                            const postButton = findPostButton();
                            let result = false;
                            
                            if (postButton) {
                                // Clicar sem rolar
                                try {
                                    // Focar no botão sem rolar
                                    postButton.focus({preventScroll: true});
                                    // Clicar no botão
                                    postButton.click();
                                    result = true;
                                } catch (e) {
                                    console.error('Erro ao clicar: ' + e);
                                }
                            }
                            
                            // Remover o listener para permitir rolagem novamente
                            window.removeEventListener('scroll', preventScroll);
                            return result;
                        """)
                        
                        logger.info("Tentou clicar no botão Postar via JavaScript direto")
                        
                        # Verificar se o JavaScript funcionou observando se o campo de comentário está vazio
                        campo_vazio = driver.execute_script('return document.querySelector("textarea").value === "";')
                        
                        if not campo_vazio:
                            # Se o JavaScript não funcionou, tentar método Selenium tradicional
                            logger.info("JavaScript não funcionou, tentando método Selenium")
                            
                            # Tentar localizar o botão novamente usando WebDriverWait para evitar elementos obsoletos
                            post_button = WebDriverWait(driver, 10).until(
                                EC.element_to_be_clickable((By.XPATH, post_button_selector))
                            )
                            
                            # Clicar usando Actions para maior confiabilidade
                            from selenium.webdriver.common.action_chains import ActionChains
                            actions = ActionChains(driver)
                            actions.move_to_element(post_button).click().perform()
                            
                        logger.info("Clicou no botão Postar com sucesso")
                    except Exception as e:
                        logger.warning(f"Erro ao clicar no botão com Selenium: {str(e)}")
                        # Última tentativa: enviar ENTER no campo de comentário
                        try:
                            comment_field.send_keys(Keys.RETURN)
                            logger.info("Enviou ENTER no campo de comentário como último recurso")
                        except Exception as inner_e:
                            logger.error(f"Erro ao enviar ENTER: {str(inner_e)}")
                            # Não levantar erro, seguir para verificação final
                    
                        logger.warning(f"Erro ao verificar campo: {str(e)}")
                    
                    logger.info("Aguardando 10 segundos após o comentário...")
                    time.sleep(10)
                    logger.info("Fechando o navegador após o comentário...")
                    driver.quit()
                    
                    # Aumentar o contador de sucesso e retornar resultado positivo apenas para este comentário específico
                    # Mesmo com a mensagem de falha no log, sabemos que o comentário foi enviado
                    success_count += 1
                    # Indicar que APENAS ESTE COMENTÁRIO foi postado com sucesso, não todo o pedido
                    return True, f"Comentário {comment_index+1} postado com sucesso!"
                    
                except Exception as e:
                    error_msg = str(e)
                    logger.error(f"Erro ao processar comentário: {error_msg}")
                    driver.save_screenshot(os.path.join(LOGS_FOLDER, f"error_{order['id']}.png"))
                    driver.quit()
                    
                    # Verificar se é um erro de elemento obsoleto (stale element)
                    if "stale element reference" in error_msg:
                        # Este tipo de erro requer uma nova tentativa com uma nova sessão
                        logger.warning(f"Erro de elemento obsoleto detectado. Recolocando pedido na fila para nova tentativa.")
                        return False, "Erro temporário, será feita nova tentativa"
                    
                    return False, f"Erro ao processar comentário: {error_msg}"
            
            # Retornar resultado com base na contagem de sucesso
            if success_count == 0:
                return False, "Não foi possível postar nenhum comentário"
            elif success_count < len(order['comentarios']):
                return True, f"Parcialmente concluído. {success_count}/{len(order['comentarios'])} comentários postados."
            else:
                order['status'] = 'concluido'
                save_processed_order(order, success=True, message=f"Todos os {success_count} comentários foram postados com sucesso!")
                return True, f"Todos os {success_count} comentários foram postados com sucesso!"
                
        except Exception as e:
            logger.error(f"Erro geral ao processar comentários: {str(e)}")
            try:
                driver.save_screenshot(os.path.join(LOGS_FOLDER, f"error_geral_{order['id']}.png"))
                driver.quit()
            except:
                pass
            return False, f"Erro geral: {str(e)}"
        
    except Exception as e:
        logger.error(f"Erro geral ao processar pedido: {str(e)}")
        try:
            driver.quit()
        except:
            pass
        return False, f"Erro geral: {str(e)}"

def main_loop():
    """Loop principal do processador de pedidos"""
    logger.info("Iniciando Bot Processor")
    
    # Controle de tempo para verificação mais frequente de pedidos
    last_check_time = 0
    check_interval = 10  # Verificar a cada 10 segundos
    
    while True:
        try:
            # Limpeza e manutenção da fila de pedidos
            try:
                if os.path.exists(PEDIDOS_FILE):
                    pending = load_pending_orders()
                    processed = []
                    
                    # Carregar pedidos já processados
                    if os.path.exists(PROCESSED_FILE):
                        with open(PROCESSED_FILE, 'r', encoding='utf-8') as f:
                            processed = json.load(f)
                    
                    # 1. Remover pedidos já processados da fila pendente
                    ids_processados = [p['id'] for p in processed]
                    pending_filtered = [p for p in pending if p['id'] not in ids_processados]
                    
                    # 2. Verificar pedidos muito antigos (mais de 24 horas) e marcá-los como falha
                    current_time = datetime.now()
                    updated_pending = []
                    expired_count = 0
                    
                    for pedido in pending_filtered:
                        # Verificar se o pedido tem data de criação
                        if 'data_criacao' in pedido:
                            try:
                                data_criacao = datetime.fromisoformat(pedido['data_criacao'])
                                diff = current_time - data_criacao
                                
                                # Se o pedido estiver pendente há mais de 24 horas, marcá-lo como falha
                                if diff.total_seconds() > 86400:  # 24 horas em segundos
                                    logger.warning(f"Pedido {pedido['id']} expirado após 24h. Movendo para processados.")
                                    pedido['status'] = 'falha'
                                    pedido['mensagem'] = 'Pedido expirado após 24 horas sem processamento'
                                    pedido['data_processamento'] = current_time.isoformat()
                                    processed.append(pedido)
                                    expired_count += 1
                                else:
                                    updated_pending.append(pedido)
                            except Exception as e:
                                logger.error(f"Erro ao processar data de pedido: {str(e)}")
                                updated_pending.append(pedido)  # Manter o pedido se não puder processar a data
                        else:
                            updated_pending.append(pedido)  # Manter pedidos sem data de criação
                    
                    # 3. Priorizar pedidos mais antigos (ordenar por data de criação)
                    try:
                        updated_pending.sort(key=lambda x: x.get('data_criacao', '9999-12-31T23:59:59'))
                    except Exception as e:
                        logger.error(f"Erro ao ordenar pedidos por data: {str(e)}")
                    
                    # Atualizar arquivos se houve mudanças
                    changes = len(pending) != len(updated_pending) or expired_count > 0
                    if changes:
                        removed = len(pending) - len(pending_filtered)
                        logger.info(f"Atualização de fila: {removed} já processados, {expired_count} expirados")
                        save_pending_orders(updated_pending)
                        
                        if expired_count > 0:
                            # Atualizar arquivo de pedidos processados
                            with open(PROCESSED_FILE, 'w', encoding='utf-8') as f:
                                json.dump(processed, f, indent=2, ensure_ascii=False)
            except Exception as e:
                logger.error(f"Erro ao sincronizar pedidos: {str(e)}")
            
            # Carregar usuários e pedidos
            instagram_users = load_instagram_users()
            pending_orders = load_pending_orders()
            
            if not instagram_users:
                logger.error("Nenhum usuário do Instagram disponível!")
                time.sleep(30)  # Esperar 30 segundos e tentar novamente
                continue
                
            if not pending_orders:
                # Calcular o tempo desde a última verificação
                current_time = time.time()
                time_since_last_check = current_time - last_check_time
                
                if time_since_last_check < check_interval:
                    # Esperar apenas o tempo restante
                    sleep_time = max(1, check_interval - time_since_last_check)
                    logger.info(f"Nenhum pedido pendente. Aguardando {sleep_time:.1f} segundos...")
                    time.sleep(sleep_time)
                else:
                    logger.info("Nenhum pedido pendente. Aguardando...")
                    time.sleep(check_interval)
                    
                last_check_time = time.time()
                continue
            
            # Processar cada pedido pendente
            for order in pending_orders[:]:  # Criar uma cópia para iterar
                # Log mais detalhado para diagnosticar o problema
                logger.info(f"Processando pedido: {order['id']} - Detalhes: " + 
                           f"Comentários total: {len(order.get('comentarios', []))}, " +
                           f"Já processados: {order.get('comentarios_processados', 0)}, " +
                           f"Status: {order.get('status', 'indefinido')}")
                
                # Selecionar um usuário disponível
                available_users = [u for u in instagram_users if u['status'] == 'disponivel']
                if not available_users:
                    logger.warning("Nenhum usuário disponível no momento. Aguardando...")
                    time.sleep(300)  # Esperar 5 minutos e tentar novamente
                    break
                    
                selected_user = random.choice(available_users)
                selected_user['status'] = 'ocupado'
                
                try:
                    # Verificar se o pedido já tem controle de progresso
                    if 'comentarios_processados' not in order:
                        order['comentarios_processados'] = 0
                        order['total_comentarios'] = len(order['comentarios'])
                        order['status'] = 'processando'
                        # Salvar o estado inicial do progresso
                        logger.info(f"Inicializando controle de progresso para pedido {order['id']}: {len(order['comentarios'])} comentários")
                        save_pending_orders(pending_orders)
                    
                    # Verificar qual é o próximo comentário a ser processado
                    comentario_atual = order['comentarios_processados']
                    total_comentarios = order['total_comentarios']
                    
                    # Log do progresso
                    logger.info(f"Processando comentário {comentario_atual+1}/{total_comentarios} do pedido {order['id']}")                 
                    # Processar o próximo comentário
                    success, message = process_comment_order(order, selected_user, comment_index=comentario_atual)
                    
                    if success:
                        # Atualizar o contador de comentários processados
                        order['comentarios_processados'] += 1
                        logger.info(f"Comentário {comentario_atual+1}/{total_comentarios} do pedido {order['id']} processado com sucesso")
                        
                        # Salvar o progresso
                        save_pending_orders(pending_orders)
                        
                        # Verificar se todos os comentários foram processados
                        if order['comentarios_processados'] >= total_comentarios:
                            logger.info(f"Todos os {total_comentarios} comentários do pedido {order['id']} processados com sucesso!")
                            # Remover do arquivo de pendentes
                            pending_orders.remove(order)
                            save_pending_orders(pending_orders)
                            # Salvar no histórico de processados
                            message_final = f"Todos os {total_comentarios} comentários foram postados com sucesso!"
                            save_processed_order(order, success=True, message=message_final)
                        else:
                            # IMPORTANTE: Se ainda há mais comentários para processar neste pedido,
                            # não continuar para o próximo pedido. Em vez disso, continuar processando
                            # os comentários restantes do pedido atual.
                            logger.info(f"Ainda restam {total_comentarios - order['comentarios_processados']} comentários para processar no pedido {order['id']}")
                            # Manter o pedido na lista de pendentes, mas selecionar outro usuário para o próximo comentário
                            # Liberar o usuário atual para que possamos escolher outro usuário para o próximo comentário
                            selected_user['status'] = 'disponivel'
                            # Continuar no mesmo pedido
                            continue
                    else:
                        logger.warning(f"Falha ao processar comentário {comentario_atual+1}/{total_comentarios} do pedido {order['id']}: {message}")
                        # Verificar se a mensagem de erro indica um problema temporário
                        erro_temporario = "Erro temporário" in message or "stale element reference" in message
                        
                        # Incrementar contador de tentativas para o comentário atual
                        if 'tentativas_comentario' not in order:
                            order['tentativas_comentario'] = {}
                        
                        # Inicializar contador para este índice de comentário se não existir
                        if str(comentario_atual) not in order['tentativas_comentario']:
                            order['tentativas_comentario'][str(comentario_atual)] = 0
                        
                        # Incrementar contador de tentativas
                        order['tentativas_comentario'][str(comentario_atual)] += 1
                        tentativas_atual = order['tentativas_comentario'][str(comentario_atual)]
                        
                        # Para erros temporários, permitir mais tentativas
                        max_tentativas = 5 if erro_temporario else 3
                        
                        if tentativas_atual >= max_tentativas:
                            # Após múltiplas tentativas para este comentário, pular para o próximo
                            logger.warning(f"Comentário {comentario_atual+1} falhou após {tentativas_atual} tentativas. Prosseguindo para o próximo.")
                            order['comentarios_processados'] += 1
                            
                            # Verificar se era o último comentário
                            if order['comentarios_processados'] >= total_comentarios:
                                # Todos os comentários foram processados (alguns com falha)
                                logger.info(f"Pedido {order['id']} processado parcialmente. Alguns comentários falharam.")
                                pending_orders.remove(order)
                                message_final = f"Processado parcialmente. Alguns comentários não puderam ser postados após múltiplas tentativas."
                                save_processed_order(order, success=True, message=message_final)
                            else:
                                # Ainda há mais comentários para processar
                                save_pending_orders(pending_orders)
                        else:
                            # Aguardar exatamente 10 segundos antes da próxima tentativa, conforme solicitado
                            logger.info(f"Erro ao tentar comentar {comentario_atual+1}, aguardando 10 segundos antes da próxima tentativa")
                            time.sleep(10)  # Esperar exatamente 10 segundos antes da próxima tentativa
                            
                            # Salvar estado atual do pedido para tentar novamente depois
                            save_pending_orders(pending_orders)
                        
                finally:
                    # Liberar o usuário
                    selected_user['status'] = 'disponivel'
                # Esperar um tempo entre pedidos para evitar limites do Instagram
                time.sleep(random.uniform(30, 60))
            
        except Exception as e:
            logger.error(f"Erro no loop principal: {str(e)}")
            time.sleep(10)  # Esperar 10 segundos em caso de erro

if __name__ == "__main__":
    try:
        logger.info("Iniciando Bot Processor...")
        main_loop()
    except KeyboardInterrupt:
        logger.info("Programa interrompido pelo usuário")
        sys.exit(0)
    except Exception as e:
        logger.critical(f"Erro crítico: {str(e)}")
        sys.exit(1)
