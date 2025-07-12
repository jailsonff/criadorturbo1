import time
import random
import os
import pyperclip
import threading
import time
from PyQt5.QtCore import QThread, pyqtSignal
from verificador_curtida import VerificadorCurtida
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException, StaleElementReferenceException
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains

class AutomacaoAcoesWorker(QThread):
    """
    Worker para executar ações automatizadas em posts do Instagram usando perfis do Dolphin Anty.
    """
    # Sinais: perfil, ação, sucesso, mensagem
    acao_concluida = pyqtSignal(str, str, bool, str)
    progresso_atualizado = pyqtSignal(int, int)  # ações concluídas, total de ações
    status_update = pyqtSignal(str)
    automacao_concluida = pyqtSignal()

    def __init__(self, dolphin_manager, post_url, perfis, total_acoes, perfis_simultaneos, 
                 tempo_entre_acoes, curtir=True, comentar=False, texto_comentario="", parent=None):
        super().__init__(parent)
        self.dolphin_manager = dolphin_manager
        self.post_url = post_url
        self.perfis = perfis  # Lista de nomes de usuário dos perfis
        self.total_acoes = total_acoes
        self.perfis_simultaneos = perfis_simultaneos
        self.tempo_entre_acoes = tempo_entre_acoes
        self.curtir = curtir
        self.comentar = comentar
        
        # Tratar o texto_comentario como uma lista de comentários
        if texto_comentario:
            # Dividir o texto em linhas e filtrar linhas vazias
            self.lista_comentarios = [linha.strip() for linha in texto_comentario.split('\n') if linha.strip()]
        else:
            self.lista_comentarios = []
        self._stop_flag = False
        self.acoes_concluidas = 0
        self.workers_ativos = {}  # Armazena os drivers ativos por perfil
        self.verificador = VerificadorCurtida()
        self.verificador.status_update.connect(self.status_update)

    def stop(self):
        """Para a execução da automação e fecha todos os navegadores abertos."""
        self._stop_flag = True
        # Fechar todos os navegadores abertos para cada perfil ativo
        if hasattr(self, 'workers_ativos'):
            for username, driver in list(self.workers_ativos.items()):
                try:
                    if driver:
                        self.dolphin_manager.close_profile_driver(username)
                except Exception as e:
                    print(f"[ERRO] Falha ao fechar navegador do perfil {username}: {e}")
            self.workers_ativos.clear()


    def run(self):
        """Executa a automação de ações nos perfis."""
        if not self.perfis or not self.post_url:
            self.status_update.emit("❌ Erro: URL do post ou lista de perfis vazia.")
            self.automacao_concluida.emit()
            return

        # Verifica se o número de ações é maior que o número de perfis disponíveis
        if self.total_acoes > len(self.perfis):
            self.status_update.emit(f"⚠️ Aviso: O número de ações ({self.total_acoes}) é maior que o número de perfis disponíveis ({len(self.perfis)}). Alguns perfis serão usados mais de uma vez.")

        # Embaralha a lista de perfis para usar em ordem aleatória
        self.perfis_disponiveis = self.perfis.copy()
        random.shuffle(self.perfis_disponiveis)

        # Inicia o loop de automação
        self.acoes_concluidas = 0
        self.progresso_atualizado.emit(self.acoes_concluidas, self.total_acoes)
        
        # Criar um lock para acesso thread-safe à variável acoes_concluidas
        self.acoes_lock = threading.Lock()
        
        # Criar uma lista para controlar os perfis já usados
        self.perfis_em_execucao = []
        
        while self.acoes_concluidas < self.total_acoes and not self._stop_flag:
            # Verificar quantos workers estão ativos no momento
            workers_ativos_count = len(self.workers_ativos)
            
            # Se já temos o máximo de workers ativos, mas ainda não atingimos o total de ações
            # Aguardamos menos tempo (apenas 0.5 segundos) para verificar mais frequentemente
            if workers_ativos_count >= self.perfis_simultaneos:
                time.sleep(0.5)
                continue
            
            # Verificar quantas ações já foram iniciadas (em execução + concluídas)
            with self.acoes_lock:
                acoes_em_andamento = len(self.perfis_em_execucao)
                acoes_totais_iniciadas = acoes_em_andamento + self.acoes_concluidas
                # Se já temos perfis suficientes para completar o total de ações, não inicie mais nenhum
                if acoes_totais_iniciadas >= self.total_acoes:
                    self.status_update.emit(f"Já há {acoes_em_andamento} ações em andamento e {self.acoes_concluidas} concluídas. Total desejado: {self.total_acoes}. Não iniciando novos perfis.")
                    novos_workers = 0
                else:
                    # Quantos novos workers podemos iniciar (considerando as ações já em andamento)
                    novos_workers = min(self.perfis_simultaneos - workers_ativos_count, 
                                    self.total_acoes - acoes_totais_iniciadas)
            
            # Lista de perfis para iniciar neste ciclo
            perfis_para_iniciar = []
            
            # Seleciona os perfis para iniciar
            for _ in range(novos_workers):
                if self._stop_flag:
                    break
                
                # Se não há mais perfis disponíveis, reutiliza a lista
                if not self.perfis_disponiveis:
                    self.perfis_disponiveis = self.perfis.copy()
                    random.shuffle(self.perfis_disponiveis)
                    self.status_update.emit(f"♻️ Lista de perfis esgotada e reiniciada com {len(self.perfis_disponiveis)} perfis")
                
                # Pega o próximo perfil disponível
                username = self.perfis_disponiveis.pop(0)
                
                # Só adiciona se ainda não ultrapassamos o limite de ações
                with self.acoes_lock:
                    # Verificar novamente se não ultrapassamos o limite
                    total_perfis = len(self.perfis_em_execucao) + self.acoes_concluidas
                    if total_perfis < self.total_acoes:
                        # Adiciona à lista de perfis para iniciar
                        perfis_para_iniciar.append(username)
                        
                        # Adiciona à lista de controle de perfis em execução
                        self.perfis_em_execucao.append(username)
                        
                        # Adiciona o perfil à lista de ativos para controlar o limite de simultaneidade
                        self.workers_ativos[username] = None
                        self.status_update.emit(f"🚀 Adicionando perfil '{username}' à fila de execução ({len(self.perfis_em_execucao)} em execução, {self.acoes_concluidas} concluídas, total desejado: {self.total_acoes})")
                    else:
                        self.status_update.emit(f"Não adicionando perfil '{username}' - já atingimos o limite de ações ({total_perfis}/{self.total_acoes}).")
            
            # Verificar novamente se já atingimos o número total de ações antes de iniciar novos perfis
            with self.acoes_lock:
                if self.acoes_concluidas >= self.total_acoes:
                    self.status_update.emit(f"✨ Número total de ações já foi atingido: {self.acoes_concluidas}/{self.total_acoes}")
                    self._stop_flag = True
                    break
            
            # Somente iniciar novos perfis se ainda não atingimos o total
            if not self._stop_flag:
                # ABORDAGEM MELHORADA: Preparar todas as threads primeiro, depois iniciar todas juntas
                # Isso garante que todos os navegadores realmente iniciem simultaneamente
                threads_para_iniciar = []
                
                for username in perfis_para_iniciar:
                    # Verificar novamente antes de cada inicialização
                    with self.acoes_lock:
                        if self.acoes_concluidas >= self.total_acoes or self._stop_flag:
                            self.status_update.emit(f"✨ Número total de ações atingido durante a preparação: {self.acoes_concluidas}/{self.total_acoes}")
                            self._stop_flag = True
                            break
                    
                    # Cria a thread mas NÃO a inicia ainda
                    thread = threading.Thread(target=self._executar_acao_perfil, args=(username,))
                    thread.daemon = True  # A thread será encerrada quando o programa principal terminar
                    threads_para_iniciar.append(thread)
                    self.status_update.emit(f"📡 Perfil '{username}' preparado e aguardando inicialização simultânea")
                
                # Agora que todas as threads estão preparadas, inicie-as todas juntas
                if threads_para_iniciar:
                    # Forçar uma pequena pausa para garantir que todas as threads estejam prontas
                    time.sleep(0.5)
                    
                    # Criando uma barreira que força todas as threads a começarem exatamente ao mesmo tempo
                    self.status_update.emit(f"📣 ATENÇÃO: Iniciando {len(threads_para_iniciar)} navegadores EXATAMENTE ao mesmo tempo!")
                    # Log detalhado para debug
                    for i, thread in enumerate(threads_para_iniciar):
                        self.status_update.emit(f"   🚀 Thread {i+1}/{len(threads_para_iniciar)} pronta para iniciar...")
                    
                    # Iniciar todas as threads em sequência rápida sem pausas
                    self.status_update.emit(f">>> INICIANDO TODAS AS THREADS SIMULTANEAMENTE <<<")
                    for thread in threads_para_iniciar:
                        thread.start()
                        
                    self.status_update.emit(f"✅ Todas as {len(threads_para_iniciar)} threads foram iniciadas!")
                    # NÃO há sleep aqui para garantir que as threads comecem o mais próximo possível uma da outra
            
            # Aguarda um pouco antes de verificar novamente
            time.sleep(1)
        
        # Aguarda todos os workers ativos terminarem
        while self.workers_ativos and not self._stop_flag:
            time.sleep(1)
        
        # Emite o sinal de conclusão
        self.automacao_concluida.emit()

    def _executar_acao_perfil(self, username):
        """Executa a ação para um perfil específico."""
        # Se o perfil já está sendo processado, ignora
        if username in self.workers_ativos and self.workers_ativos[username] is not None:
            self.status_update.emit(f"⚠️ Perfil '{username}' já está sendo processado, pulando...")
            return
            
        driver = None
        acoes_realizadas = []
        
        try:
            # Passo 1: Iniciar o perfil no Dolphin Anty
            self.status_update.emit(f"🚀 Iniciando perfil '{username}'...")
            
            resultado = self.dolphin_manager.launch_profile_instagram(username)
            
            # O método launch_profile_instagram retorna uma tupla (sucesso, mensagem) ou o driver
            if isinstance(resultado, tuple):
                sucesso, mensagem = resultado
                if not sucesso:
                    self.status_update.emit(f"❌ Erro ao iniciar perfil '{username}': {mensagem}")
                    self.acao_concluida.emit(username, "iniciar", False, f"Erro: {mensagem}")
                    return
                # Se chegou aqui, o perfil foi iniciado com sucesso, mas precisamos obter o driver
                driver = self.dolphin_manager.get_profile_driver(username)
                if not driver:
                    self.status_update.emit(f"❌ Erro ao obter driver para '{username}'. Perfil iniciado mas driver não disponível.")
                    self.acao_concluida.emit(username, "iniciar", False, "Driver não disponível")
                    return
            else:
                # Se não for uma tupla, assume que é o driver diretamente
                driver = resultado
                
            if not driver:
                self.status_update.emit(f"❌ Erro ao iniciar perfil '{username}'. Verifique se o perfil existe.")
                self.acao_concluida.emit(username, "iniciar", False, "Erro ao iniciar perfil")
                return
            
            # Atualiza o registro do driver para este perfil
            self.workers_ativos[username] = driver
            self.status_update.emit(f"✅ Perfil '{username}' iniciado com sucesso! ({len(self.workers_ativos)} perfis ativos)")
            
            # Passo 2: Verificar login
            self.status_update.emit(f"🔍 Verificando login do perfil '{username}'...")
            
            is_logged_in = self.dolphin_manager.is_logged_in(driver)
            if not is_logged_in:
                self.status_update.emit(f"⚠️ Perfil '{username}' não está logado no Instagram. Tentando fazer login automático...")
                
                # Obtendo credenciais do perfil - ajuste para usar o método correto do seu sistema
                usuario_info = self.dolphin_manager.get_profile_metadata(username)
                if not usuario_info or 'instagram_password' not in usuario_info:
                    self.status_update.emit(f"❌ Não foi possível encontrar as credenciais para o perfil '{username}'.")
                    self.acao_concluida.emit(username, "verificar_login", False, "Credenciais não encontradas")
                    if username in self.workers_ativos:
                        del self.workers_ativos[username]
                    return
                
                # Tentando fazer login automaticamente
                password = usuario_info.get('instagram_password')
                email_or_user = usuario_info.get('instagram_username', username)
                
                self.status_update.emit(f"🔑 Tentando login automático para '{username}'...")
                max_retries = 2
                login_success = False
                
                for retry in range(max_retries):
                    try:
                        # Usando o método attempt_login_instagram para fazer login
                        login_result = self.dolphin_manager.attempt_login_instagram(driver, username, password)
                        
                        if isinstance(login_result, tuple):
                            login_success, login_message = login_result
                        else:
                            login_success = bool(login_result)
                            login_message = "Login realizado" if login_success else "Falha no login"
                        
                        if login_success:
                            self.status_update.emit(f"✅ Login automático bem-sucedido para '{username}'!")
                            break
                        else:
                            self.status_update.emit(f"⚠️ Tentativa {retry+1}/{max_retries} de login falhou: {login_message}")
                            if retry < max_retries - 1:
                                self.status_update.emit(f"🔄 Aguardando antes de tentar novamente...")
                                time.sleep(3)
                    except Exception as e:
                        self.status_update.emit(f"❌ Erro ao tentar login automático: {str(e)}")
                        if retry < max_retries - 1:
                            self.status_update.emit(f"🔄 Aguardando antes de tentar novamente...")
                            time.sleep(3)
                
                # Verificar novamente se o login foi bem-sucedido após as tentativas
                is_logged_in = self.dolphin_manager.is_logged_in(driver)
                if not is_logged_in:
                    self.status_update.emit(f"❌ Não foi possível fazer login automático para '{username}' após {max_retries} tentativas.")
                    self.acao_concluida.emit(username, "verificar_login", False, "Falha no login automático")
                    
                    # Remover o perfil da lista de ativos
                    if username in self.workers_ativos:
                        del self.workers_ativos[username]
                    
                    # Remover o perfil da lista de perfis em execução
                    if username in self.perfis_em_execucao:
                        self.perfis_em_execucao.remove(username)
                    
                    self.status_update.emit(f"⏭️ Pulando para o próximo perfil da fila devido a falha no login")
                    
                    # Tentar iniciar um novo perfil para substituir este que falhou
                    with self.acoes_lock:
                        # Verificar se ainda precisamos de mais ações
                        acoes_em_andamento = len(self.perfis_em_execucao)
                        acoes_totais_iniciadas = acoes_em_andamento + self.acoes_concluidas
                        
                        if acoes_totais_iniciadas < self.total_acoes and not self._stop_flag:
                            # Colocar este perfil no final da fila para tentar novamente depois (se necessário)
                            if username not in self.perfis_disponiveis:
                                self.perfis_disponiveis.append(username)
                                self.status_update.emit(f"♻️ Perfil '{username}' adicionado ao final da fila para tentar novamente mais tarde")
                    
                    return
                
                self.status_update.emit(f"✅ Perfil '{username}' está logado no Instagram!")
            
            # Passo 3: Navegar para o post
            self.status_update.emit(f"🌐 Navegando para o post com perfil '{username}'...")
            
            try:
                driver.get(self.post_url)
                time.sleep(15)  # Aguarda mais tempo para o carregamento inicial da página
            except Exception as e:
                self.status_update.emit(f"❌ Erro ao navegar para o post: {str(e)}")
            
            # Passo 4: Executar ação de curtir (se solicitado)
            if self.curtir:
                self._curtir_post_evitando_menu(driver, username, acoes_realizadas)
            
            # Passo 4.1: Executar ação de comentar (se solicitado)
            if self.comentar and self.lista_comentarios:
                # Selecionar um comentário aleatório da lista
                comentario_aleatorio = random.choice(self.lista_comentarios)
                self.status_update.emit(f"💬 Selecionando comentário aleatório: '{comentario_aleatorio[:20]}...'")
                self._comentar_post(driver, username, comentario_aleatorio, acoes_realizadas)
            
            # Passo 5: Registrar as ações realizadas e atualizar contadores
            if acoes_realizadas:
                realizar_mais_acoes = True
                # Usar o lock compartilhado para garantir que a atualização seja thread-safe
                with self.acoes_lock:
                    # Remover perfil da lista de perfis em execução
                    if username in self.perfis_em_execucao:
                        self.perfis_em_execucao.remove(username)
                    
                    # Sistema rotativo: adicionar o perfil ao final da fila para ações futuras
                    # Isso garante que cada perfil seja usado de forma equilibrada
                    if self.acoes_concluidas + 1 < self.total_acoes and not self._stop_flag:
                        # Adicionar o perfil ao final da lista de perfis disponíveis (se não estiver lá)
                        if username not in self.perfis_disponiveis:
                            self.perfis_disponiveis.append(username)
                            self.status_update.emit(f"♻️ Perfil '{username}' movido para o final da fila para uso futuro")
                    
                    # Atualizar contador de ações concluídas
                    self.acoes_concluidas += 1
                    # Emitir sinal para atualizar a interface em tempo real
                    self.progresso_atualizado.emit(self.acoes_concluidas, self.total_acoes)
                    # Verificar se atingimos o número total de ações
                    # Não encerramos os outros navegadores aqui, apenas emitimos o sinal
                    if self.acoes_concluidas >= self.total_acoes:
                        self.status_update.emit(f"✨ Total de ações concluídas! ({self.acoes_concluidas}/{self.total_acoes})")
                        self._stop_flag = True  # Para o bot quando atingir o total de ações
                        realizar_mais_acoes = False
                        self.status_update.emit(f"🌟 Bot pausado após {self.acoes_concluidas} ações concluídas.")
                        
                        # Não encerramos os navegadores ativos aqui para permitir que completem suas ações
                        # Os navegadores serão fechados naturalmente após completarem suas ações
                
                self.acao_concluida.emit(username, ", ".join(acoes_realizadas), True, "Ação realizada com sucesso")
                self.status_update.emit(f"✅ Ações realizadas com perfil '{username}': {', '.join(acoes_realizadas)} (Total: {self.acoes_concluidas}/{self.total_acoes})")
                
            else:
                self.status_update.emit(f"⚠️ Nenhuma ação foi realizada com o perfil '{username}'.")
                self.acao_concluida.emit(username, "nenhuma", False, "Nenhuma ação foi realizada")
            
            # Passo 6: Aguardar o tempo configurado entre ações
            if self.tempo_entre_acoes > 0 and username in self.workers_ativos:
                self.status_update.emit(f"⏱️ Aguardando {self.tempo_entre_acoes} segundos antes da próxima ação...")
                time.sleep(self.tempo_entre_acoes)
            
        except Exception as e:
            self.status_update.emit(f"❌ Erro durante execução da ação para '{username}': {str(e)}")
            self.acao_concluida.emit(username, "execucao", False, f"Erro: {str(e)}")
            
            if username in self.workers_ativos:
                del self.workers_ativos[username]
    
    def _curtir_post_evitando_menu(self, driver, username, acoes_realizadas):
        """Tenta curtir o post evitando clicar no botão de 'mais opções'."""
        self.status_update.emit(f"❤️ Tentando curtir o post com perfil '{username}'...")
        curtida_realizada = False
        
        # VERIFICAR PRIMEIRO: Checar se o post já está curtido
        self.status_update.emit(f"🔄 Verificando se o post já está curtido...")
        
        post_ja_curtido = self._verificar_post_ja_curtido(driver, username)
        
        if post_ja_curtido:
            curtida_realizada = True
            acoes_realizadas.append("curtir")
            return
        
        # Verificar se há menu aberto e fechá-lo
        self._fechar_menu_se_aberto(driver, username)
        
        # ESTRATÉGIA: Procurar o botão de curtir
        self.status_update.emit(f"🔄 Procurando botão de curtir...")
        
        # Seletores específicos para o botão de curtir (evitando o botão de mais opções)
        seletores_curtir = [
            # Seletores para o botão de curtir
            "//section[1]/div[1]/div/span[1]/button",  # Botão de curtir na primeira posição
            "//section[1]/span[1]/button",  # Outro formato comum
            "//section[1]/div/span[1]/div",  # Div que contém o botão
            "//section[1]/div[1]/span[1]",  # Span que contém o botão
            
            # Seletores específicos para o SVG de curtir
            "//svg[@aria-label='Curtir' and not(ancestor::div[@aria-label='Mais opções'])]",
            "//svg[@aria-label='Curtir' and not(ancestor::div[@role='button'][@aria-label='Mais opções'])]",
            
            # Seletores baseados na posição (o botão de curtir geralmente é o primeiro)
            "//article//section//div[1]/span[1]//svg",
            "//article//section//div[1]/button[1]",
            
            # Seletores baseados nas classes específicas do botão de curtir
            "//div[contains(@class, 'x78zum5')]/span[1]//svg[@aria-label='Curtir']",
            "//div[contains(@class, 'x1ypdohk')]/div[contains(@class, 'x78zum5')]//svg[@aria-label='Curtir']",
            
            # Seletores baseados no path do SVG
            "//svg[.//path[contains(@d, 'M16.792 3.904')]]",
        ]
        
        # Seletores para evitar explicitamente
        seletores_evitar = [
            "//div[@aria-label='Mais opções']",
            "//div[@role='button'][@aria-label='Mais opções']",
            "//svg[@aria-label='Mais opções']",
            "//button[@aria-label='Mais opções']",
        ]
        
        # Loop para tentar curtir (só sai quando curtir ou quando o worker for parado)
        tentativa = 0
        while not curtida_realizada and not self._stop_flag:
            tentativa += 1
            self.status_update.emit(f"🔄 Tentativa #{tentativa} de curtir o post...")
            
            # Garantir que a página esteja carregada
            self._aguardar_carregamento_pagina(driver, username)
            
            # Verificar se há menu aberto e fechá-lo
            self._fechar_menu_se_aberto(driver, username)
            
            # Capturar screenshot para debug a cada 5 tentativas
            if tentativa % 5 == 1:
                self._capturar_screenshot(driver, username, f"attempt_{tentativa}")
            
            # Tentar cada seletor específico para o botão de curtir
            for i, seletor in enumerate(seletores_curtir):
                # Verificar se o elemento existe
                elementos = driver.find_elements(By.XPATH, seletor)
                if not elementos:
                    continue
                
                # Verificar se algum dos elementos deve ser evitado
                for elem in elementos:
                    try:
                        if not elem.is_displayed():
                            continue
                        
                        # Verificar se este elemento não é o botão de "mais opções"
                        deve_evitar = False
                        for seletor_evitar in seletores_evitar:
                            elementos_evitar = elem.find_elements(By.XPATH, f".{seletor_evitar}")
                            if elementos_evitar and any(e.is_displayed() for e in elementos_evitar):
                                deve_evitar = True
                                break
                        
                        if deve_evitar:
                            continue
                        
                        # Tentar clicar de várias formas
                        try:
                            # Método 1: Clique direto
                            elem.click()
                            curtida_realizada = True
                            break
                        except Exception:
                            try:
                                # Método 2: Clique via JavaScript
                                driver.execute_script("arguments[0].click();", elem)
                                curtida_realizada = True
                                break
                            except Exception:
                                try:
                                    # Método 3: Clique via ActionChains
                                    actions = ActionChains(driver)
                                    actions.click(elem).perform()
                                    curtida_realizada = True
                                    break
                                except Exception:
                                    pass
                    except Exception:
                        continue
                
                if curtida_realizada:
                    break
            
            # Verificar se a curtida foi bem-sucedida
            if curtida_realizada:
                self.status_update.emit(f"🔄 Verificando se a curtida foi bem-sucedida...")
                time.sleep(5)  # Aguardar mais tempo para a ação ser processada
                
                # Verificar se há menu aberto e fechá-lo
                self._fechar_menu_se_aberto(driver, username)
                
                # Capturar screenshot para verificar visualmente
                self._capturar_screenshot(driver, username, "after_click")
                
                # Verificar de múltiplas maneiras se o post foi curtido
                curtido = self._verificar_post_ja_curtido(driver, username)
                
                if curtido:
                    self.status_update.emit(f"✅ Curtida realizada com sucesso!")
                    # Capturar screenshot final para debug
                    self._capturar_screenshot(driver, username, "after_successful_like")
                    
                    # Usar método unificado para atualizar status da ação concluída
                    return self._atualizar_status_acao_concluida(driver, username, acoes_realizadas, "curtir")
                else:
                    # Tentar verificar novamente com mais tempo
                    self.status_update.emit(f"🔄 Primeira verificação não confirmou curtida, aguardando mais...")
                    time.sleep(3)
                    
                    # Segunda tentativa de verificação
                    if self._verificar_post_ja_curtido(driver, username):
                        self.status_update.emit(f"✅ Curtida confirmada na segunda verificação!")
                        self._capturar_screenshot(driver, username, "after_successful_like_2nd_check")
                        
                        # Usar método unificado para atualizar status da ação concluída
                        return self._atualizar_status_acao_concluida(driver, username, acoes_realizadas, "curtir")
                    else:
                        self.status_update.emit(f"⚠️ Não foi possível confirmar a curtida, continuando...")
                        # Resetar a flag para continuar tentando
                        curtida_realizada = False
            
            # Se não conseguiu curtir, aguarda um pouco antes da próxima tentativa
            if not curtida_realizada:
                self.status_update.emit(f"⏱️ Aguardando antes da próxima tentativa...")
                time.sleep(5)
                
                # A cada 5 tentativas, recarregar a página
                if tentativa % 5 == 0:
                    self.status_update.emit(f"🔄 Recarregando a página após {tentativa} tentativas...")
                    try:
                        driver.refresh()
                        time.sleep(15)  # Aguarda o carregamento da página
                    except Exception:
                        pass

    def _fechar_menu_se_aberto(self, driver, username):
        """Verifica se há um menu aberto e tenta fechá-lo."""
        try:
            # Verificar se há menu de compartilhamento aberto
            menu_elements = driver.find_elements(By.XPATH, "//div[contains(text(), 'Compartilhar') or contains(text(), 'Denunciar') or contains(text(), 'Cancelar')]")
            if menu_elements and any(elem.is_displayed() for elem in menu_elements):
                self.status_update.emit(f"🔄 Fechando menu de compartilhamento...")
                
                # Tentar clicar no botão Cancelar
                cancelar_buttons = driver.find_elements(By.XPATH, "//button[contains(text(), 'Cancelar')]")
                if cancelar_buttons and any(elem.is_displayed() for elem in cancelar_buttons):
                    for cancelar in cancelar_buttons:
                        if cancelar.is_displayed():
                            try:
                                cancelar.click()
                                time.sleep(2)
                                return
                            except Exception:
                                pass
                
                # Tentar pressionar ESC
                try:
                    actions = ActionChains(driver)
                    actions.send_keys(Keys.ESCAPE).perform()
                    time.sleep(2)
                except Exception:
                    pass
                
                # Tentar clicar fora do menu
                try:
                    body = driver.find_element(By.TAG_NAME, "body")
                    actions = ActionChains(driver)
                    actions.click(body).perform()
                    time.sleep(2)
                except Exception:
                    pass
        except Exception:
            pass

    def _verificar_post_ja_curtido(self, driver, username):
        """Verifica se o post já está curtido usando métodos específicos e confiáveis."""
        try:
            # Método 1: Procura por botões de descurtir (indica que já está curtido)
            descurtir_elements = driver.find_elements(By.XPATH, "//svg[@aria-label='Descurtir']")
            if descurtir_elements and any(elem.is_displayed() for elem in descurtir_elements):
                self.status_update.emit(f"✅ Post já está curtido (botão 'Descurtir' encontrado)!")
                return True
            
            # Método 2: Verifica se o botão está vermelho (curtido) - apenas SVGs com fill exato #ED4956
            vermelho_elements = driver.find_elements(By.XPATH, "//svg[@fill='#ED4956']")
            if vermelho_elements and any(elem.is_displayed() for elem in vermelho_elements):
                self.status_update.emit(f"✅ Post já está curtido (botão vermelho)!")
                return True
            
            # Verificar se temos botão de curtir visível - se tiver, significa que o post NÃO está curtido
            curtir_elements = driver.find_elements(By.XPATH, "//svg[@aria-label='Curtir']")
            if curtir_elements and any(elem.is_displayed() for elem in curtir_elements):
                return False
            
            # Verificar a presença de texto de "Descurtir" em qualquer elemento
            descurtir_text = driver.find_elements(By.XPATH, "//*[contains(text(), 'Descurtir') or contains(@aria-label, 'Descurtir')]")                                    
            if descurtir_text and any(elem.is_displayed() for elem in descurtir_text):
                self.status_update.emit(f"✅ Post já está curtido (texto 'Descurtir' encontrado)!")
                return True
                
            self.status_update.emit(f"🔄 Nenhuma confirmação de curtida, tentando curtir...")
            return False  # Se não temos certeza, assumimos que não está curtido para tentar curtir
        except Exception:
            return False  # Em caso de erro, assumimos que não está curtido

    def _aguardar_carregamento_pagina(self, driver, username):
        """Aguarda o carregamento da página."""
        try:
            # Aguardar que qualquer elemento da página esteja visível
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
        except Exception:
            pass

    def _comentar_post(self, driver, username, texto_comentario, acoes_realizadas):
        """Tenta adicionar um comentário ao post."""
        self.status_update.emit(f"💬 Tentando comentar no post com perfil '{username}'...")
        comentario_realizado = False
        max_tentativas = 3  # Reduzido para 3 tentativas conforme solicitado pelo usuário
        tentativa = 0
        
        # Substituir quebras de linha no texto do comentário
        texto = texto_comentario.replace('\n', ' ')
        
        # Copiar para a área de transferência para uso posterior
        pyperclip.copy(texto)
        
        while tentativa < max_tentativas and not comentario_realizado and not self._stop_flag:
            tentativa += 1
            self.status_update.emit(f"🔄 Tentativa #{tentativa} de comentar no post...")
            
            # Capturar screenshot para debug
            self._capturar_screenshot(driver, username, f"comment_attempt_{tentativa}")
            
            try:
                # Seletores para o campo de comentário
                seletores_comentario = [
                    "//textarea[@placeholder='Adicione um comentário...']",
                    "//textarea[@aria-label='Adicione um comentário...']",
                    "//form//textarea",
                    "//div[@role='dialog']//textarea",
                    "//*[contains(@placeholder, 'coment') or contains(@placeholder, 'Coment')]"
                ]
                
                # Tentar cada seletor
                campo_comentario = None
                for seletor in seletores_comentario:
                    elementos = driver.find_elements(By.XPATH, seletor)
                    for elem in elementos:
                        if elem.is_displayed():
                            campo_comentario = elem
                            break
                    if campo_comentario:
                        break
                
                if not campo_comentario:
                    self.status_update.emit(f"⚠️ Campo de comentário não encontrado, tentando novamente...")
                    # Pressionar Tab algumas vezes para tentar focar o campo de comentário
                    actions = ActionChains(driver)
                    for _ in range(3):
                        actions.send_keys(Keys.TAB).perform()
                        time.sleep(1)
                        
                        # Tentar novamente os seletores após pressionar Tab
                        for seletor in seletores_comentario:
                            elementos = driver.find_elements(By.XPATH, seletor)
                            for elem in elementos:
                                if elem.is_displayed():
                                    campo_comentario = elem
                                    break
                            if campo_comentario:
                                break
                                
                        if campo_comentario:
                            break
                    
                    if not campo_comentario:
                        # Última tentativa: procurar qualquer textarea visível
                        textareas = driver.find_elements(By.TAG_NAME, "textarea")
                        for textarea in textareas:
                            if textarea.is_displayed():
                                campo_comentario = textarea
                                break
                
                # Se encontrou o campo de comentário, tenta inserir o texto
                if campo_comentario:
                    # Clicar no campo para focar
                    try:
                        campo_comentario.click()
                        time.sleep(2)
                    except Exception:
                        # Se não puder clicar diretamente, tente com JS
                        driver.execute_script("arguments[0].click();", campo_comentario)
                        time.sleep(2)
                    
                    # Método 1: Usando send_keys
                    try:
                        campo_comentario.clear()  # Limpar qualquer texto existente
                        campo_comentario.send_keys(texto)
                    except Exception:
                        # Método 2: Usando JavaScript
                        try:
                            driver.execute_script("arguments[0].value = arguments[1]", campo_comentario, texto)
                        except Exception:
                            # Método 3: Usando a área de transferência
                            try:
                                actions = ActionChains(driver)
                                actions.key_down(Keys.CONTROL).send_keys('v').key_up(Keys.CONTROL).perform()
                            except Exception:
                                self.status_update.emit(f"⚠️ Não foi possível inserir texto no campo.")
                                continue
                    
                    # Aguardar um momento para garantir que o texto foi inserido
                    time.sleep(2)
                    
                    # SUPER DETECTOR DE BOTÃO PUBLICAR
                    self.status_update.emit(f"🔍 Iniciando detecção intensiva do botão Publicar...")
                    
                    # Número máximo de tentativas para encontrar o botão
                    max_tentativas_botao = 10
                    tentativa_botao = 0
                    botao_publicar_encontrado = False
                    botao_publicado = False
                    
                    # Capturar screenshot para análise
                    self._capturar_screenshot(driver, username, "before_publish_button_search")
                    
                    while tentativa_botao < max_tentativas_botao and not botao_publicado and not self._stop_flag:
                        tentativa_botao += 1
                        self.status_update.emit(f"🔍 Tentativa #{tentativa_botao} de encontrar botão publicar...")
                        
                        # Seletores específicos fornecidos pelo usuário (prioridade máxima)
                        seletores_publicar = [
                            # Seletores de div que contém o texto "Postar"
                            "//div[@role='button'][text()='Postar']",
                            "//div[@role='button'][contains(text(), 'Postar')]",
                            "//div[@role='button'][@tabindex='0'][contains(text(), 'Postar')]",
                            "//div[contains(@class, 'x1i10hfl')][contains(@role, 'button')][contains(text(), 'Postar')]",
                            
                            # XPaths exatos fornecidos pelo usuário
                            "/html/body/div[9]/div[1]/div/div[3]/div/div/div/div/div[2]/div/article/div/div[2]/div/div/div[2]/section[3]/div/form/div/div[2]/div",
                            "/html/body/div[9]/div[1]/div/div[3]/div/div/div/div/div[2]/div/article/div/div[2]/div/div/div[2]/section[3]/div/form/div",
                            
                            # Variantes dos XPaths (para adaptar a diferentes versões)
                            "//div/article/div/div[2]/div/div/div[2]/section[3]/div/form/div/div[2]/div",
                            "//article//section[3]/div/form/div/div[2]/div",
                            "//form/div/div[2]/div[contains(text(), 'Postar')]",
                            
                            # Busca por elementos próximos ao textarea
                            "//textarea[@placeholder='Adicione um comentário...']/following::div[contains(text(), 'Postar')]",
                            "//textarea[@aria-label='Adicione um comentário...']/following::div[contains(text(), 'Postar')]",
                            "//textarea[contains(@placeholder, 'coment')]/parent::*/following-sibling::div",
                            
                            # Busca elementos com as classes específicas do botão Postar
                            "//div[contains(@class, 'x1i10hfl') and contains(@class, 'xjqpnuy') and contains(@class, 'xa49m3k')][contains(text(), 'Postar')]",
                            
                            # Botões baseados em texto (backup)
                            "//button[text()='Publicar']",
                            "//button[contains(text(), 'Publicar')]",
                            "//button[text()='Postar']",
                            "//button[contains(text(), 'Postar')]",
                            "//button[text()='Post']",
                            "//button[contains(text(), 'Post')]",
                            "//button[contains(text(), 'Comment')]",
                            "//button[text()='Enviar']",
                            "//button[contains(text(), 'Enviar')]"
                        ]
                        
                        # Buscar botões
                        for seletor in seletores_publicar:
                            # Se já encontrou o botão, não continua a busca
                            if botao_publicado:
                                break
                                
                            try:
                                botoes = driver.find_elements(By.XPATH, seletor)
                                self.status_update.emit(f"Encontrados {len(botoes)} botões com seletor: {seletor}")
                                
                                # Tentar clicar em cada botão visível
                                for botao in botoes:
                                    try:
                                        if botao.is_displayed() and botao.is_enabled():
                                            self.status_update.emit(f"👀 Botão potencial encontrado! Tentando clicar...")
                                            
                                            # Capturar screenshot antes do clique
                                            self._capturar_screenshot(driver, username, f"button_attempt_{tentativa_botao}")
                                            
                                            # Manter a página na posição atual sem rolagem
                                            
                                            # Mostrar informações sobre o botão
                                            try:
                                                botao_texto = botao.text
                                                botao_classe = botao.get_attribute("class")
                                                self.status_update.emit(f"Botão texto: '{botao_texto}', classe: '{botao_classe}'")
                                            except Exception:
                                                pass
                                            
                                            # Tentar múltiplos métodos de clique
                                            clique_ok = False
                                            
                                            # Método 1: Clique direto
                                            try:
                                                botao.click()
                                                self.status_update.emit(f"✅ Clique direto executado!")
                                                clique_ok = True
                                            except Exception as e1:
                                                self.status_update.emit(f"Erro no clique direto: {str(e1)}")
                                                
                                                # Método 2: JavaScript
                                                try:
                                                    driver.execute_script("arguments[0].click();", botao)
                                                    self.status_update.emit(f"✅ Clique via JavaScript executado!")
                                                    clique_ok = True
                                                except Exception as e2:
                                                    self.status_update.emit(f"Erro no clique JavaScript: {str(e2)}")
                                                    
                                                    # Método 3: ActionChains
                                                    try:
                                                        actions = ActionChains(driver)
                                                        actions.click(botao).perform()
                                                        self.status_update.emit(f"✅ Clique via ActionChains executado!")
                                                        clique_ok = True
                                                    except Exception as e3:
                                                        self.status_update.emit(f"Erro no ActionChains: {str(e3)}")
                                                        
                                                        # Método 4: TouchActions (para mobile)
                                                        try:
                                                            driver.execute_script(
                                                                "var evt = document.createEvent('MouseEvents');"
                                                                "evt.initMouseEvent('click',true,true,window,0,0,0,0,0,false,false,false,false,0,null);"
                                                                "arguments[0].dispatchEvent(evt);", botao)
                                                            self.status_update.emit(f"✅ Clique via MouseEvent executado!")
                                                            clique_ok = True
                                                        except Exception as e4:
                                                            self.status_update.emit(f"Todos os métodos de clique falharam")
                                            
                                            if clique_ok:
                                                self.status_update.emit(f"✅ Tentativa de clique realizada, aguardando...")
                                                time.sleep(4)  # Aguardar para ver se o comentário foi publicado
                                                
                                                # Verificar se o comentário foi publicado
                                                try:
                                                    # Capturar screenshot após o clique
                                                    self._capturar_screenshot(driver, username, f"after_click_{tentativa_botao}")
                                                    
                                                    # Verificar se o campo está vazio agora (indica que o comentário foi enviado)
                                                    campo_vazio = False
                                                    try:
                                                        novo_campo = driver.find_element(By.XPATH, "//textarea[@placeholder='Adicione um comentário...']")
                                                        if not novo_campo.get_attribute("value"):
                                                            campo_vazio = True
                                                            self.status_update.emit(f"✅ Campo está vazio após o clique!")
                                                    except Exception:
                                                        pass
                                                    
                                                    # Procurar pelo comentário na lista de comentários
                                                    try:
                                                        texto_curto = texto[:15] if len(texto) > 15 else texto
                                                        comentarios = driver.find_elements(By.XPATH, f"//div[contains(text(), '{texto_curto}')]")
                                                        if comentarios and any(elem.is_displayed() for elem in comentarios):
                                                            self.status_update.emit(f"✅ Comentário encontrado na página!")
                                                            botao_publicado = True
                                                        else:
                                                            # Se o campo está vazio mas não encontramos o comentário ainda
                                                            if campo_vazio:
                                                                self.status_update.emit(f"✅ Campo vazio mas comentário não detectado ainda")
                                                                # Esperamos que foi postado
                                                                botao_publicado = True
                                                    except Exception as e:
                                                        self.status_update.emit(f"Erro ao verificar comentário: {str(e)}")
                                                    
                                                except Exception:
                                                    pass
                                                
                                                if botao_publicado:
                                                    self.status_update.emit(f"🎉 COMENTÁRIO PUBLICADO COM SUCESSO!")
                                                    # Usar o método unificado para atualizar o status da ação
                                                    
                                                    # Mover o perfil para o final da fila (rotatividade)
                                                    self.status_update.emit(f"♻️ Movendo perfil '{username}' para o final da fila após comentário bem-sucedido")
                                                    
                                                    # Garantir que o perfil vá para o final da lista de perfis disponíveis
                                                    with self.acoes_lock:
                                                        # Verificar se ainda precisamos de mais ações no futuro
                                                        if self.acoes_concluidas < self.total_acoes - 1 and not self._stop_flag:
                                                            # Adicionar o perfil ao final da lista de perfis disponíveis (se não estiver lá)
                                                            if username not in self.perfis_disponiveis:
                                                                self.perfis_disponiveis.append(username)
                                                                self.status_update.emit(f"♻️ Perfil '{username}' movido para o final da fila após comentário bem-sucedido")
                                                    
                                                    if self._atualizar_status_acao_concluida(driver, username, acoes_realizadas, "comentar"):
                                                        break
                                    except Exception:
                                        continue
                                    
                                    if botao_publicado:
                                        break
                            except Exception as e:
                                self.status_update.emit(f"Erro ao avaliar seletor: {str(e)}")
                                continue
                        
                        # Se não publicou ainda, tenta métodos alternativos
                        if not botao_publicado:
                            self.status_update.emit(f"🔄 Tentando métodos alternativos... (tentativa {tentativa_botao})")
                            
                            # 1. Tenta pressionar Enter no campo novamente
                            try:
                                campo_comentario.click()
                                time.sleep(1)
                                campo_comentario.send_keys(Keys.RETURN)
                                self.status_update.emit(f"Enter pressionado novamente")
                                time.sleep(3)  # Aguardar para ver se funcionou
                                
                                # Verificar se campo está vazio (possível sucesso)
                                try:
                                    if not campo_comentario.get_attribute("value"):
                                        self.status_update.emit(f"✅ Campo vazio após pressionar Enter!")
                                        botao_publicado = True
                                        break
                                except Exception:
                                    pass
                            except Exception:
                                pass
                            
                            # 2. Tenta Tab + Enter
                            if not botao_publicado and tentativa_botao % 2 == 0:
                                try:
                                    actions = ActionChains(driver)
                                    actions.send_keys(Keys.TAB).perform()
                                    time.sleep(1)
                                    actions.send_keys(Keys.RETURN).perform()
                                    self.status_update.emit(f"Tab + Enter executado")
                                    time.sleep(3)  # Aguardar para ver se funcionou
                                except Exception:
                                    pass
                            
                            # 3. Tenta encontrar botões azuis (comuns no Instagram)
                            if not botao_publicado and tentativa_botao % 3 == 0:
                                try:
                                    # Buscar todos os elementos que podem ser botões azuis
                                    elementos_azuis = driver.find_elements(By.XPATH, "//button[contains(@style, 'color: rgb(0, 149, 246)') or contains(@style, 'background: rgb(0, 149, 246)')]")
                                    for elem in elementos_azuis:
                                        if elem.is_displayed():
                                            self.status_update.emit(f"Encontrado possível botão azul, tentando clicar...")
                                            try:
                                                elem.click()
                                                time.sleep(3)  # Aguardar para ver se funcionou
                                            except Exception:
                                                try:
                                                    driver.execute_script("arguments[0].click();", elem)
                                                    time.sleep(3)  # Aguardar para ver se funcionou
                                                except Exception:
                                                    pass
                                except Exception:
                                    pass
                            
                            # Aguardar um pouco antes da próxima tentativa e recarregar os elementos
                            time.sleep(2)
                            
                            # Se estamos na última tentativa, capture uma screenshot final
                            if tentativa_botao == max_tentativas_botao - 1:
                                self._capturar_screenshot(driver, username, "final_publish_attempt")
                    
                    # Se após todas as tentativas não conseguiu publicar, continuamos tentando na próxima iteração
                    if not botao_publicado:
                        self.status_update.emit(f"⚠️ Não conseguiu clicar no botão de publicar. Continuando...")
                        # Não desistimos, continuamos para a próxima tentativa do loop principal
                        continue
                    
                    # Aguardar o processamento do comentário
                    time.sleep(5)
                    
                    # Verificar se o comentário foi publicado
                    try:
                        # Procurar por elementos que indiquem que o comentário foi publicado
                        comentarios = driver.find_elements(By.XPATH, f"//div[contains(text(), '{texto[:20]}')]")
                        campo_vazio = driver.find_elements(By.XPATH, "//textarea[not(text()) or text()='']")
                        
                        if comentarios or campo_vazio:
                            comentario_realizado = True
                            self.status_update.emit(f"✅ Comentário publicado com sucesso!")
                            self._capturar_screenshot(driver, username, "after_successful_comment")
                            acoes_realizadas.append("comentar")

                            # Fechar o navegador imediatamente após comentar com sucesso
                            try:
                                driver.quit()
                                self.status_update.emit(f"✅ Navegador fechado imediatamente após comentar!")
                            except Exception as e:
                                self.status_update.emit(f"⚠️ Erro ao fechar navegador: {str(e)}")

                            return
                    except Exception:
                        pass
            except Exception as e:
                self.status_update.emit(f"⚠️ Erro ao tentar comentar: {str(e)}")
            
            # Se não conseguiu comentar, aguarda um pouco antes da próxima tentativa
            if not comentario_realizado:
                self.status_update.emit(f"⌛️ Aguardando antes da próxima tentativa...")
                time.sleep(3)
        
        if not comentario_realizado:
            self.status_update.emit(f"⚠️ Não foi possível comentar após {max_tentativas} tentativas.")
            
            # Fechar o navegador e pular para o próximo perfil conforme solicitado
            self.status_update.emit(f"⏭️ Fechando navegador e pulando para o próximo perfil da fila...")
            
            # Remover perfil da lista de ativos
            if username in self.workers_ativos:
                del self.workers_ativos[username]
            
            # Remover perfil da lista de perfis em execução
            if username in self.perfis_em_execucao:
                self.perfis_em_execucao.remove(username)
                
            # Adicionar o perfil ao final da fila para uso futuro
            if self.acoes_concluidas < self.total_acoes and not self._stop_flag:
                if username not in self.perfis_disponiveis:
                    self.perfis_disponiveis.append(username)
                    self.status_update.emit(f"♻️ Perfil '{username}' movido para o final da fila")
            
            # Fechar o navegador
            try:
                driver.quit()
                self.status_update.emit(f"✅ Navegador fechado com sucesso!")
            except Exception as e:
                self.status_update.emit(f"⚠️ Erro ao fechar navegador: {str(e)}")
                
            return False  # Retornar False para indicar que a ação não foi concluída
    
    def _atualizar_status_acao_concluida(self, driver, username, acoes_realizadas, tipo_acao):
        """Método unificado para atualizar o status quando uma ação é concluída.
        
        Args:
            driver: WebDriver do Selenium
            username: Nome do perfil que realizou a ação
            acoes_realizadas: Lista de ações realizadas para adicionar a nova ação
            tipo_acao: Tipo da ação concluída ("curtir", "comentar", etc)
        """
        # Adicionar a ação à lista de ações realizadas
        acoes_realizadas.append(tipo_acao)
        
        # Usar lock para garantir acesso thread-safe à variável compartilhada
        with self.acoes_lock:
            self.acoes_concluidas += 1
            # Emitir sinal para atualizar a interface em tempo real
            self.progresso_atualizado.emit(self.acoes_concluidas, self.total_acoes)
            # Verificar se atingimos o número total de ações
            if self.acoes_concluidas >= self.total_acoes:
                self.status_update.emit(f"✨ Total de ações concluídas! ({self.acoes_concluidas}/{self.total_acoes})")
                self._stop_flag = True  # Para o bot quando atingir o total de ações
        
        # Remover perfil da lista de perfis em execução
        if username in self.perfis_em_execucao:
            self.perfis_em_execucao.remove(username)
            
        # Sistema rotativo: adicionar o perfil ao final da fila para ações futuras
        # Isso garante que cada perfil seja usado de forma equilibrada
        with self.acoes_lock:
            # Verificar se ainda precisamos de mais ações no futuro
            if self.acoes_concluidas < self.total_acoes and not self._stop_flag:
                # Adicionar o perfil ao final da lista de perfis disponíveis (se não estiver lá)
                if username not in self.perfis_disponiveis:
                    self.perfis_disponiveis.append(username)
                    self.status_update.emit(f"♻️ Perfil '{username}' movido para o final da fila para uso futuro")
        
        # Notificar conclusão da ação
        nome_amigavel = "curtida" if tipo_acao == "curtir" else "comentário" if tipo_acao == "comentar" else tipo_acao
        self.acao_concluida.emit(username, tipo_acao, True, f"{nome_amigavel.capitalize()} realizado(a) com sucesso")
        self.status_update.emit(f"✅ Ação de {nome_amigavel} realizada com perfil '{username}' (Total: {self.acoes_concluidas}/{self.total_acoes})")
        
        # Fechar o navegador após a ação bem-sucedida
        self.status_update.emit(f"🔄 Fechando navegador após {nome_amigavel}...")
        try:
            driver.quit()
            if username in self.workers_ativos:
                del self.workers_ativos[username]
            self.status_update.emit(f"✅ Navegador fechado com sucesso! (restam {len(self.workers_ativos)} perfis ativos)")
        except Exception as e:
            # Mesmo em caso de erro, remover da lista de ativos
            if username in self.workers_ativos:
                del self.workers_ativos[username]
            self.status_update.emit(f"⚠️ Erro ao fechar navegador, mas perfil foi removido da lista: {str(e)}")
        
        # Retornar True para indicar conclusão bem-sucedida
        return True
    
    def _capturar_screenshot(self, driver, username, suffix):
        """Captura screenshot para debug."""
        try:
            base_dir = os.path.join(os.getcwd(), "insta_logs")
            os.makedirs(base_dir, exist_ok=True)
            screenshot_file = os.path.join(base_dir, f"{username}_{suffix}.png")
            driver.save_screenshot(screenshot_file)
        except Exception:
            pass
