"""
Otimizador de Perfis - Interface para otimizar o armazenamento de perfis do Instagram
Esta ferramenta permite reduzir drasticamente o tamanho da pasta Dolphin_profiles
extraindo apenas os cookies essenciais para manter as sessões.
"""
import os
import sys
import time
import threading
from PyQt5.QtWidgets import (QApplication, QMainWindow, QPushButton, QVBoxLayout, 
                            QHBoxLayout, QWidget, QLabel, QListWidget, QProgressBar,
                            QMessageBox, QComboBox, QCheckBox, QFrame, QTextEdit, 
                            QSplitter, QSpinBox, QGroupBox)
from PyQt5.QtCore import Qt, pyqtSignal, QThread, QTimer
from PyQt5.QtGui import QFont, QIcon

from dolphin_anty_optimized import DolphinAntyOptimizedManager

class OtimizadorThread(QThread):
    """Thread para executar operações de otimização sem bloquear a interface."""
    progresso = pyqtSignal(int, int, str)  # progresso atual, total, mensagem
    concluido = pyqtSignal(bool, str, str)  # sucesso, mensagem, detalhes
    
    def __init__(self, modo, manager, perfil=None, dias_preservar=7):
        super().__init__()
        self.modo = modo  # 'otimizar_um', 'otimizar_todos', 'limpar_cache'
        self.manager = manager
        self.perfil = perfil
        self.dias_preservar = dias_preservar
        
    def run(self):
        try:
            if self.modo == 'otimizar_um':
                # Otimizar um perfil específico
                self.progresso.emit(0, 1, f"Otimizando perfil {self.perfil}...")
                sucesso, mensagem = self.manager.otimizar_perfil_existente(self.perfil)
                self.progresso.emit(1, 1, "Concluído")
                self.concluido.emit(sucesso, 
                                  "Otimização concluída" if sucesso else "Falha na otimização", 
                                  mensagem)
                
            elif self.modo == 'otimizar_todos':
                # Otimizar todos os perfis
                total, sucesso, falha, mensagens = self.manager.otimizar_todos_perfis()
                for i, msg in enumerate(mensagens):
                    self.progresso.emit(i+1, total, msg)
                    # Pequena pausa para atualizar a interface
                    time.sleep(0.01)
                
                detalhes = "\n".join(mensagens)
                self.concluido.emit(sucesso > 0, 
                                   f"Otimização concluída: {sucesso} de {total} perfis", 
                                   detalhes)
                                   
            elif self.modo == 'limpar_cache':
                # Limpar cache de perfis
                self.progresso.emit(0, 1, "Limpando cache de perfis...")
                total, limpos, espaco = self.manager.limpar_cache_perfis(self.dias_preservar)
                self.progresso.emit(1, 1, "Concluído")
                self.concluido.emit(True, 
                                   f"Limpeza concluída: {limpos} de {total} perfis", 
                                   f"Espaço liberado: {espaco}")
                
        except Exception as e:
            self.concluido.emit(False, "Erro durante a operação", str(e))

class OtimizadorPerfis(QMainWindow):
    """Interface para otimização de perfis do Instagram."""
    
    def __init__(self, base_path=None):
        super().__init__()
        
        self.base_path = base_path if base_path else os.path.dirname(os.path.abspath(__file__))
        self.dolphin_profiles_dir = os.path.join(self.base_path, "dolphin_profiles")
        self.optimized_sessions_dir = os.path.join(self.base_path, "sessions_otimizadas")
        
        # Inicializar o gerenciador otimizado
        self.manager = DolphinAntyOptimizedManager(
            base_bot_path=self.base_path,
            profiles_dir="dolphin_profiles",
            optimized_sessions_dir="sessions_otimizadas"
        )
        
        self.initUI()
        self.thread = None
        
        # Atualizar lista de perfis ao iniciar
        self.atualizar_lista_perfis()
        
        # Timer para atualizar estatísticas periodicamente
        self.stats_timer = QTimer(self)
        self.stats_timer.timeout.connect(self.atualizar_estatisticas)
        self.stats_timer.start(5000)  # Atualizar a cada 5 segundos
        
        # Atualizar estatísticas iniciais
        self.atualizar_estatisticas()
    
    def initUI(self):
        """Inicializa a interface do usuário."""
        self.setWindowTitle("Otimizador de Perfis do Instagram")
        self.setGeometry(100, 100, 800, 600)
        
        # Layout principal
        main_layout = QVBoxLayout()
        
        # Título
        titulo = QLabel("🚀 Otimizador de Perfis do Instagram")
        titulo.setFont(QFont("Arial", 16, QFont.Bold))
        titulo.setAlignment(Qt.AlignCenter)
        main_layout.addWidget(titulo)
        
        # Subtítulo
        subtitulo = QLabel("Reduza drasticamente o espaço ocupado pelos perfis")
        subtitulo.setFont(QFont("Arial", 10))
        subtitulo.setAlignment(Qt.AlignCenter)
        main_layout.addWidget(subtitulo)
        
        # Estatísticas
        estatisticas_group = QGroupBox("Estatísticas de Armazenamento")
        estatisticas_layout = QVBoxLayout()
        
        self.lbl_perfis_originais = QLabel("Perfis originais: Calculando...")
        self.lbl_perfis_otimizados = QLabel("Perfis otimizados: Calculando...")
        self.lbl_espaco_original = QLabel("Espaço original: Calculando...")
        self.lbl_espaco_otimizado = QLabel("Espaço otimizado: Calculando...")
        self.lbl_economia = QLabel("Economia de espaço: Calculando...")
        
        estatisticas_layout.addWidget(self.lbl_perfis_originais)
        estatisticas_layout.addWidget(self.lbl_perfis_otimizados)
        estatisticas_layout.addWidget(self.lbl_espaco_original)
        estatisticas_layout.addWidget(self.lbl_espaco_otimizado)
        estatisticas_layout.addWidget(self.lbl_economia)
        
        estatisticas_group.setLayout(estatisticas_layout)
        main_layout.addWidget(estatisticas_group)
        
        # Divisor
        splitter = QSplitter(Qt.Horizontal)
        
        # Perfis disponíveis
        perfis_widget = QWidget()
        perfis_layout = QVBoxLayout()
        
        lbl_perfis = QLabel("Perfis Disponíveis")
        lbl_perfis.setFont(QFont("Arial", 12, QFont.Bold))
        perfis_layout.addWidget(lbl_perfis)
        
        self.lista_perfis = QListWidget()
        self.lista_perfis.setSelectionMode(QListWidget.ExtendedSelection)
        perfis_layout.addWidget(self.lista_perfis)
        
        # Botões de ação para perfis
        btn_layout_perfis = QHBoxLayout()
        
        self.btn_atualizar_lista = QPushButton("🔄 Atualizar Lista")
        self.btn_atualizar_lista.clicked.connect(self.atualizar_lista_perfis)
        
        self.btn_otimizar_selecionados = QPushButton("⚡ Otimizar Selecionados")
        self.btn_otimizar_selecionados.clicked.connect(self.otimizar_perfis_selecionados)
        
        btn_layout_perfis.addWidget(self.btn_atualizar_lista)
        btn_layout_perfis.addWidget(self.btn_otimizar_selecionados)
        
        perfis_layout.addLayout(btn_layout_perfis)
        perfis_widget.setLayout(perfis_layout)
        
        # Painel de ações
        acoes_widget = QWidget()
        acoes_layout = QVBoxLayout()
        
        lbl_acoes = QLabel("Ações Disponíveis")
        lbl_acoes.setFont(QFont("Arial", 12, QFont.Bold))
        acoes_layout.addWidget(lbl_acoes)
        
        # Grupo: Otimização em lote
        grupo_otimizacao = QGroupBox("Otimização em Lote")
        grupo_otimizacao_layout = QVBoxLayout()
        
        self.btn_otimizar_todos = QPushButton("🔄 Otimizar Todos os Perfis")
        self.btn_otimizar_todos.clicked.connect(self.otimizar_todos_perfis)
        grupo_otimizacao_layout.addWidget(self.btn_otimizar_todos)
        
        grupo_otimizacao.setLayout(grupo_otimizacao_layout)
        acoes_layout.addWidget(grupo_otimizacao)
        
        # Grupo: Limpeza de cache
        grupo_limpeza = QGroupBox("Limpeza de Cache")
        grupo_limpeza_layout = QVBoxLayout()
        
        lbl_dias = QLabel("Preservar perfis acessados nos últimos dias:")
        grupo_limpeza_layout.addWidget(lbl_dias)
        
        self.spin_dias_preservar = QSpinBox()
        self.spin_dias_preservar.setRange(0, 90)
        self.spin_dias_preservar.setValue(7)
        grupo_limpeza_layout.addWidget(self.spin_dias_preservar)
        
        self.btn_limpar_cache = QPushButton("🧹 Limpar Cache de Perfis")
        self.btn_limpar_cache.clicked.connect(self.limpar_cache)
        grupo_limpeza_layout.addWidget(self.btn_limpar_cache)
        
        grupo_limpeza.setLayout(grupo_limpeza_layout)
        acoes_layout.addWidget(grupo_limpeza)
        
        acoes_widget.setLayout(acoes_layout)
        
        # Adicionar widgets ao splitter
        splitter.addWidget(perfis_widget)
        splitter.addWidget(acoes_widget)
        
        main_layout.addWidget(splitter)
        
        # Barra de progresso
        self.progress_bar = QProgressBar()
        self.progress_bar.setTextVisible(True)
        self.progress_bar.setAlignment(Qt.AlignCenter)
        main_layout.addWidget(self.progress_bar)
        
        # Área de log
        lbl_log = QLabel("Log de Operações")
        main_layout.addWidget(lbl_log)
        
        self.text_log = QTextEdit()
        self.text_log.setReadOnly(True)
        self.text_log.setMaximumHeight(150)
        main_layout.addWidget(self.text_log)
        
        # Widget central
        central_widget = QWidget()
        central_widget.setLayout(main_layout)
        self.setCentralWidget(central_widget)
    
    def atualizar_lista_perfis(self):
        """Atualiza a lista de perfis disponíveis."""
        try:
            self.lista_perfis.clear()
            
            # Verificar se o diretório existe
            if not os.path.exists(self.dolphin_profiles_dir):
                self.adicionar_log("⚠️ Diretório de perfis não encontrado!")
                return
                
            # Listar perfis (diretórios) no diretório Dolphin_profiles
            perfis = []
            for item in os.listdir(self.dolphin_profiles_dir):
                caminho_completo = os.path.join(self.dolphin_profiles_dir, item)
                if os.path.isdir(caminho_completo) and item != "__pycache__":
                    # Verificar se o diretório contém um arquivo metadata.json
                    if os.path.exists(os.path.join(caminho_completo, "metadata.json")):
                        perfis.append(item)
            
            # Adicionar à lista
            for perfil in sorted(perfis):
                # Verificar se o perfil já foi otimizado
                ja_otimizado = os.path.exists(os.path.join(self.optimized_sessions_dir, perfil, "cookies.json"))
                texto_perfil = f"{perfil} {'✅' if ja_otimizado else ''}"
                self.lista_perfis.addItem(texto_perfil)
                
            self.adicionar_log(f"🔄 Lista de perfis atualizada: {len(perfis)} perfis encontrados")
            
        except Exception as e:
            self.adicionar_log(f"❌ Erro ao atualizar lista: {str(e)}")
    
    def adicionar_log(self, mensagem):
        """Adiciona uma mensagem ao log com data e hora."""
        timestamp = time.strftime("%H:%M:%S")
        self.text_log.append(f"[{timestamp}] {mensagem}")
        # Rolar para o final
        scrollbar = self.text_log.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())
    
    def atualizar_progresso(self, atual, total, mensagem):
        """Atualiza a barra de progresso e o log."""
        porcentagem = int((atual / total) * 100) if total > 0 else 0
        self.progress_bar.setValue(porcentagem)
        self.progress_bar.setFormat(f"{porcentagem}% - {atual}/{total} - {mensagem}")
        
        # Adicionar ao log se a mensagem não estiver vazia
        if mensagem and mensagem != "Concluído":
            self.adicionar_log(mensagem)
    
    def operacao_concluida(self, sucesso, mensagem, detalhes):
        """Manipula o evento de conclusão de uma operação."""
        if sucesso:
            icone = QMessageBox.Information
            titulo = "Operação Concluída"
        else:
            icone = QMessageBox.Warning
            titulo = "Falha na Operação"
            
        self.adicionar_log(f"{'✅' if sucesso else '❌'} {mensagem}")
        
        # Mostrar detalhes apenas se houver conteúdo significativo
        if detalhes and detalhes != mensagem:
            self.adicionar_log(f"Detalhes: {detalhes}")
            
            # Mostrar caixa de diálogo apenas para mensagens importantes
            if not sucesso or "Erro" in mensagem or "Falha" in mensagem:
                QMessageBox.information(self, titulo, f"{mensagem}\n\n{detalhes}", icone)
        
        # Atualizar a lista após a conclusão
        self.atualizar_lista_perfis()
        self.atualizar_estatisticas()
        
        # Limpar a referência à thread
        self.thread = None
    
    def otimizar_perfis_selecionados(self):
        """Otimiza os perfis selecionados na lista."""
        if self.thread is not None:
            QMessageBox.warning(self, "Operação em Andamento", 
                              "Uma operação já está em andamento. Aguarde sua conclusão.")
            return
            
        itens_selecionados = self.lista_perfis.selectedItems()
        if not itens_selecionados:
            QMessageBox.warning(self, "Nenhum Perfil Selecionado", 
                              "Selecione pelo menos um perfil para otimizar.")
            return
            
        perfis_selecionados = []
        for item in itens_selecionados:
            # Remover o sufixo ✅ se existir
            perfil = item.text().replace(" ✅", "")
            perfis_selecionados.append(perfil)
            
        # Confirmar com o usuário
        resposta = QMessageBox.question(self, "Confirmar Otimização", 
                                     f"Deseja otimizar {len(perfis_selecionados)} perfis selecionados?",
                                     QMessageBox.Yes | QMessageBox.No)
        if resposta != QMessageBox.Yes:
            return
            
        # Iniciar otimização para cada perfil
        for i, perfil in enumerate(perfis_selecionados):
            self.adicionar_log(f"▶️ Iniciando otimização do perfil: {perfil}")
            
            # Atualizar progresso
            self.atualizar_progresso(i, len(perfis_selecionados), f"Otimizando {perfil}...")
            
            # Iniciar thread para não bloquear a interface
            self.thread = OtimizadorThread('otimizar_um', self.manager, perfil)
            self.thread.progresso.connect(self.atualizar_progresso)
            self.thread.concluido.connect(self.operacao_concluida)
            self.thread.start()
            
            # Aguardar conclusão antes de continuar para o próximo
            while self.thread is not None:
                QApplication.processEvents()
                time.sleep(0.1)
    
    def otimizar_todos_perfis(self):
        """Otimiza todos os perfis disponíveis."""
        if self.thread is not None:
            QMessageBox.warning(self, "Operação em Andamento", 
                              "Uma operação já está em andamento. Aguarde sua conclusão.")
            return
            
        # Confirmar com o usuário
        resposta = QMessageBox.question(self, "Confirmar Otimização", 
                                     "Deseja otimizar TODOS os perfis?\nIsso pode levar bastante tempo.",
                                     QMessageBox.Yes | QMessageBox.No)
        if resposta != QMessageBox.Yes:
            return
            
        self.adicionar_log("▶️ Iniciando otimização de todos os perfis")
        
        # Iniciar thread para otimizar todos os perfis
        self.thread = OtimizadorThread('otimizar_todos', self.manager)
        self.thread.progresso.connect(self.atualizar_progresso)
        self.thread.concluido.connect(self.operacao_concluida)
        self.thread.start()
    
    def limpar_cache(self):
        """Limpa o cache de perfis para liberar espaço."""
        if self.thread is not None:
            QMessageBox.warning(self, "Operação em Andamento", 
                              "Uma operação já está em andamento. Aguarde sua conclusão.")
            return
            
        dias = self.spin_dias_preservar.value()
        
        # Confirmar com o usuário
        resposta = QMessageBox.question(self, "Confirmar Limpeza", 
                                     f"Deseja limpar o cache de todos os perfis?\nPerfis acessados nos últimos {dias} dias serão preservados.",
                                     QMessageBox.Yes | QMessageBox.No)
        if resposta != QMessageBox.Yes:
            return
            
        self.adicionar_log(f"▶️ Iniciando limpeza de cache (preservando perfis dos últimos {dias} dias)")
        
        # Iniciar thread para limpeza
        self.thread = OtimizadorThread('limpar_cache', self.manager, dias_preservar=dias)
        self.thread.progresso.connect(self.atualizar_progresso)
        self.thread.concluido.connect(self.operacao_concluida)
        self.thread.start()
    
    def calcular_tamanho_diretorio(self, path):
        """Calcula o tamanho total de um diretório em bytes."""
        total_size = 0
        try:
            if os.path.exists(path):
                for dirpath, dirnames, filenames in os.walk(path):
                    for f in filenames:
                        fp = os.path.join(dirpath, f)
                        if os.path.exists(fp):
                            total_size += os.path.getsize(fp)
        except Exception as e:
            print(f"Erro ao calcular tamanho do diretório {path}: {e}")
        return total_size
    
    def formatar_tamanho(self, tamanho_bytes):
        """Formata o tamanho em bytes para uma forma legível (KB, MB, GB)."""
        if tamanho_bytes < 1024:
            return f"{tamanho_bytes} bytes"
        elif tamanho_bytes < 1024 * 1024:
            return f"{tamanho_bytes / 1024:.2f} KB"
        elif tamanho_bytes < 1024 * 1024 * 1024:
            return f"{tamanho_bytes / (1024 * 1024):.2f} MB"
        else:
            return f"{tamanho_bytes / (1024 * 1024 * 1024):.2f} GB"
    
    def atualizar_estatisticas(self):
        """Atualiza as estatísticas de armazenamento."""
        # Contar perfis
        perfis_originais = 0
        if os.path.exists(self.dolphin_profiles_dir):
            for item in os.listdir(self.dolphin_profiles_dir):
                if os.path.isdir(os.path.join(self.dolphin_profiles_dir, item)) and item != "__pycache__":
                    perfis_originais += 1
        
        perfis_otimizados = 0
        if os.path.exists(self.optimized_sessions_dir):
            for item in os.listdir(self.optimized_sessions_dir):
                caminho = os.path.join(self.optimized_sessions_dir, item)
                if os.path.isdir(caminho) and os.path.exists(os.path.join(caminho, "cookies.json")):
                    perfis_otimizados += 1
        
        # Calcular tamanhos
        self.lbl_perfis_originais.setText(f"Perfis originais: {perfis_originais}")
        self.lbl_perfis_otimizados.setText(f"Perfis otimizados: {perfis_otimizados}")
        
        # Iniciar cálculo de tamanho em uma thread separada para não bloquear a interface
        threading.Thread(target=self.calcular_estatisticas_tamanho, daemon=True).start()
    
    def calcular_estatisticas_tamanho(self):
        """Calcula estatísticas de tamanho em thread separada e atualiza a interface."""
        try:
            tamanho_original = self.calcular_tamanho_diretorio(self.dolphin_profiles_dir)
            tamanho_otimizado = self.calcular_tamanho_diretorio(self.optimized_sessions_dir)
            
            # Economia de espaço
            if tamanho_original > 0:
                economia_percentual = 100 - (tamanho_otimizado / tamanho_original * 100)
            else:
                economia_percentual = 0
                
            # Atualizar interface na thread principal usando QTimer para garantir que seja executado na thread principal
            QTimer.singleShot(0, lambda: self._atualizar_labels_estatisticas(tamanho_original, tamanho_otimizado, economia_percentual))
        except Exception as e:
            print(f"Erro ao calcular estatísticas: {e}")
            
    def _atualizar_labels_estatisticas(self, tamanho_original, tamanho_otimizado, economia_percentual):
        """Atualiza as labels de estatísticas na thread principal."""
        try:
            self.lbl_espaco_original.setText(f"Espaço original: {self.formatar_tamanho(tamanho_original)}")
            self.lbl_espaco_otimizado.setText(f"Espaço otimizado: {self.formatar_tamanho(tamanho_otimizado)}")
            self.lbl_economia.setText(f"Economia de espaço: {economia_percentual:.2f}%")
        except Exception as e:
            print(f"Erro ao atualizar labels: {e}")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = OtimizadorPerfis()
    window.show()
    sys.exit(app.exec_())
