import sys
import os
from PyQt5.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QFileDialog, QTableWidget, QTableWidgetItem, QAbstractItemView, QLabel, QLineEdit, QTextEdit, QSpinBox, QTabWidget, QMessageBox, QCheckBox)
from PyQt5.QtGui import QColor, QPalette
from PyQt5.QtCore import Qt, QThread, pyqtSignal, QRunnable, QThreadPool, QObject
from user_manager import UserManager
from instagram_bot import InstagramBot
from chatgpt_tab import ChatGPTTab

class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('ESPECIALISTA EM COMENTÁRIOS')
        self.setMinimumSize(900, 600)
        self.user_manager = UserManager()
        self.selected_users = []
        self.init_ui()

    def init_ui(self):
        self.tabs = QTabWidget()
        self.tab_bot = QWidget()
        self.tab_chat = ChatGPTTab(openai_api_key=os.getenv('OPENAI_API_KEY', ''))
        self.tabs.addTab(self.tab_bot, 'Bot Instagram')
        self.tabs.addTab(self.tab_chat, 'Bate-papo ChatGPT')
        self.layout = QVBoxLayout(self)
        self.layout.addWidget(self.tabs)
        self.init_bot_tab()
        self.setLayout(self.layout)
        self.setStyleSheet('''
            QWidget { background-color: #111; color: #FFD600; font-size: 14px; }
            QPushButton { background-color: #FFD600; color: #111; border-radius: 5px; font-weight: bold; padding: 6px; }
            QPushButton:hover { background-color: #FFC400; }
            QTableWidget { background-color: #222; color: #FFD600; }
            QLineEdit, QTextEdit { background-color: #222; color: #FFD600; border: 1px solid #FFD600; }
            QTabWidget::pane { border: 1px solid #FFD600; }
            QHeaderView::section { background-color: #FFD600; color: #111; }
        ''')

    def init_bot_tab(self):
        # Status de contagem de ações
        self.status_counts_label = QLabel('Ações: ✔ 0   ✖ 0')
        self.status_counts_label.setStyleSheet('font-size: 16px; color: #FFD600; font-weight: bold;')
        layout = QVBoxLayout()
        # Importação de usuários
        import_layout = QHBoxLayout()
        self.btn_import_users = QPushButton('Importar Usuários (TXT/CSV)')
        self.btn_import_users.clicked.connect(self.import_users)
        self.btn_import_cookies = QPushButton('Importar Pasta de Cookies')
        self.btn_import_cookies.clicked.connect(self.import_cookies)
        self.btn_update_users = QPushButton('Atualizar Lista de Usuários')
        self.btn_update_users.clicked.connect(self.update_users)
        import_layout.addWidget(self.btn_import_users)
        import_layout.addWidget(self.btn_import_cookies)
        import_layout.addWidget(self.btn_update_users)
        layout.addLayout(import_layout)
        # Tabela de usuários
        self.table_users = QTableWidget(0, 4)
        self.table_users.setHorizontalHeaderLabels(['Selecionar', 'Usuário', 'Cookies', 'Status'])
        self.table_users.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table_users.setEditTriggers(QAbstractItemView.NoEditTriggers)
        layout.addWidget(self.table_users)
        # Seleção de todos
        self.chk_select_all = QCheckBox('Selecionar Todos')
        self.chk_select_all.stateChanged.connect(self.select_all_users)
        layout.addWidget(self.chk_select_all)
        # Link do post
        post_layout = QHBoxLayout()
        post_layout.addWidget(QLabel('Link do Post:'))
        self.input_post = QLineEdit()
        post_layout.addWidget(self.input_post)
        layout.addLayout(post_layout)
        # Comentários
        layout.addWidget(QLabel('Comentários (um por linha):'))
        self.input_comments = QTextEdit()
        layout.addWidget(self.input_comments)
        # Configurações
        config_layout = QHBoxLayout()
        config_layout.addWidget(QLabel('Usuários Simultâneos:'))
        self.spin_simultaneous = QSpinBox(); self.spin_simultaneous.setMinimum(1); self.spin_simultaneous.setMaximum(20)
        config_layout.addWidget(self.spin_simultaneous)
        config_layout.addWidget(QLabel('Ações por Usuário:'))
        self.spin_actions = QSpinBox(); self.spin_actions.setMinimum(1); self.spin_actions.setMaximum(100)
        config_layout.addWidget(self.spin_actions)
        # Checkbox para mostrar navegador
        self.chk_show_browser = QCheckBox('Mostrar navegador')
        self.chk_show_browser.setChecked(True)
        config_layout.addWidget(self.chk_show_browser)
        layout.addLayout(config_layout)
        # Status de contagem de ações
        layout.addWidget(self.status_counts_label)
        # Botão de envio
        self.btn_send = QPushButton('Enviar Comentário')
        self.btn_send.clicked.connect(self.start_send_comments_thread)
        layout.addWidget(self.btn_send)
        # Campo de log
        layout.addWidget(QLabel('Log de Execução:'))
        self.log_box = QTextEdit()
        self.log_box.setReadOnly(True)  # Somente leitura, mas permite seleção e cópia
        self.log_box.setStyleSheet('background-color: #222; color: #FFD600; border: 1px solid #FFD600;')
        layout.addWidget(self.log_box)
        self.tab_bot.setLayout(layout)

    def import_users(self):
        file, _ = QFileDialog.getOpenFileName(self, 'Importar Usuários', '', 'Arquivos TXT/CSV (*.txt *.csv)')
        if file:
            self.user_manager.load_users(file)
            self.refresh_user_table()
            self.log(f'Usuários importados de: {file}')

    def import_cookies(self):
        folder = QFileDialog.getExistingDirectory(self, 'Selecionar Pasta de Cookies')
        if folder:
            self.user_manager.load_cookies(folder)
            self.refresh_user_table()
            self.log(f'Cookies importados da pasta: {folder}')

    def update_users(self):
        if self.user_manager.user_file:
            self.user_manager.load_users()
            self.user_manager.load_cookies()
            self.refresh_user_table()
            self.log('Lista de usuários atualizada.')
        else:
            self.log('Importe um arquivo de usuários primeiro!')

    def refresh_user_table(self):
        users = self.user_manager.get_users()
        self.table_users.setRowCount(len(users))
        for i, user in enumerate(users):
            chk = QTableWidgetItem(); chk.setFlags(Qt.ItemIsUserCheckable | Qt.ItemIsEnabled)
            chk.setCheckState(Qt.Unchecked)
            self.table_users.setItem(i, 0, chk)
            self.table_users.setItem(i, 1, QTableWidgetItem(user['username']))
            cookies_status = 'Sim' if user.get('cookies') else 'Não'
            self.table_users.setItem(i, 2, QTableWidgetItem(cookies_status))
            # Status: vazio ao carregar
            status_item = QTableWidgetItem('')
            status_item.setTextAlignment(Qt.AlignCenter)
            self.table_users.setItem(i, 3, status_item)

    def select_all_users(self, state):
        for i in range(self.table_users.rowCount()):
            item = self.table_users.item(i, 0)
            item.setCheckState(Qt.Checked if state == Qt.Checked else Qt.Unchecked)

    def get_selected_users(self):
        users = self.user_manager.get_users()
        selected = []
        for i in range(len(users)):
            if self.table_users.item(i, 0).checkState() == Qt.Checked:
                selected.append(users[i])
        return selected

    class WorkerSignals(QObject):
        log_signal = pyqtSignal(str)
        error_signal = pyqtSignal(str)
        status_signal = pyqtSignal(int, str)
        done_signal = pyqtSignal()

    class UserWorker(QRunnable):
        def __init__(self, idx, user, post_url, comments, actions_per_user, headless, cookies_folder, signals):
            super().__init__()
            self.idx = idx
            self.user = user
            self.post_url = post_url
            self.comments = comments
            self.actions_per_user = actions_per_user
            self.headless = headless
            self.cookies_folder = cookies_folder
            self.signals = signals

        def run(self):
            import traceback
            bot = None
            try:
                bot = InstagramBot(headless=self.headless)
                self.signals.log_signal.emit(f'Iniciando com usuário: {self.user["username"]}')
                if self.user.get('cookies'):
                    bot.login_with_cookies(self.user['username'], self.user['cookies'])
                    self.signals.log_signal.emit(f'Login com cookies para {self.user["username"]}')
                else:
                    bot.login(self.user['username'], self.user['password'], self.cookies_folder)
                    self.signals.log_signal.emit(f'Login com senha para {self.user["username"]}')
                # Verificar se está logado
                if not bot.is_logged_in():
                    self.signals.error_signal.emit(f'Usuário {self.user["username"]} não está conectado. Pulando para o próximo.')
                    self.signals.log_signal.emit(f'Usuário {self.user["username"]} não está conectado. Pulando para o próximo.')
                    self.signals.status_signal.emit(self.idx, 'fail')
                    return
                for i in range(self.actions_per_user):
                    comment = self.comments[(self.idx * self.actions_per_user + i) % len(self.comments)]
                    try:
                        bot.comment_post(self.post_url, comment)
                        self.signals.log_signal.emit(f'Comentário enviado por {self.user["username"]}: {comment}')
                    except Exception as e:
                        tb = traceback.format_exc()
                        self.signals.error_signal.emit(f'Erro ao comentar com {self.user["username"]}: {e}\n{tb}')
                        self.signals.log_signal.emit(f'Erro ao comentar com {self.user["username"]}: {e}\n{tb}')
                        self.signals.status_signal.emit(self.idx, 'fail')
                        return
                self.signals.status_signal.emit(self.idx, 'success')
                self.signals.log_signal.emit(f'Usuário {self.user["username"]} finalizou todas as ações.')
                import time
                time.sleep(5)  # Aguarda 5 segundos antes de fechar o navegador
            except Exception as e:
                tb = traceback.format_exc()
                self.signals.error_signal.emit(f'Erro inesperado com usuário {self.user["username"]}: {e}\n{tb}')
                self.signals.log_signal.emit(f'Erro inesperado com usuário {self.user["username"]}: {e}\n{tb}')
                self.signals.status_signal.emit(self.idx, 'fail')
            finally:
                if bot:
                    try:
                        bot.close()
                    except Exception as e:
                        self.signals.log_signal.emit(f'Erro ao fechar o navegador para {self.user["username"]}: {e}')
                self.signals.done_signal.emit()

    def start_send_comments_thread(self):
        self.success_count = 0
        self.fail_count = 0
        self.update_status_counts()
        self.btn_send.setEnabled(False)
        self.log('Iniciando envio de comentários...')
        post_url = self.input_post.text().strip()
        comments = [c.strip() for c in self.input_comments.toPlainText().split('\n') if c.strip()]
        simultaneous = self.spin_simultaneous.value()
        actions_per_user = self.spin_actions.value()
        users = self.get_selected_users()
        if not post_url or not comments or not users:
            QMessageBox.warning(self, 'Aviso', 'Preencha todos os campos e selecione ao menos um usuário!')
            self.log('Tentativa de envio sem preencher todos os campos obrigatórios.')
            self.btn_send.setEnabled(True)
            return
        headless = not self.chk_show_browser.isChecked()
        self._workers_done = 0
        self._total_workers = len(users)
        self.threadpool = QThreadPool()
        self.threadpool.setMaxThreadCount(simultaneous)
        self._signals = self.WorkerSignals()
        self._signals.log_signal.connect(self.log)
        self._signals.error_signal.connect(self.show_error)
        self._signals.status_signal.connect(self.update_user_status)
        self._signals.done_signal.connect(self.on_worker_done)
        for idx, user in enumerate(users):
            worker = self.UserWorker(idx, user, post_url, comments, actions_per_user, headless, self.user_manager.cookies_folder, self._signals)
            self.threadpool.start(worker)

    def on_worker_done(self):
        self._workers_done += 1
        self.update_status_counts()
        if self._workers_done == self._total_workers:
            self.refresh_user_table()
            self.btn_send.setEnabled(True)
            # Não mostrar popup, apenas logar
            self.log('Comentários enviados!')

    def update_user_status(self, idx, status):
        # Verde para sucesso, vermelho para erro
        item = self.table_users.item(idx, 3)
        if status == 'success':
            item.setText('✔')
            item.setForeground(QColor('green'))
            self.success_count += 1
        else:
            item.setText('✖')
            item.setForeground(QColor('red'))
            self.fail_count += 1
        self.update_status_counts()

    def update_status_counts(self):
        self.status_counts_label.setText(f'Ações: ✔ {self.success_count}   ✖ {self.fail_count}')

    def on_comments_done(self):
        self.refresh_user_table()
        self.btn_send.setEnabled(True)
        self.log('Comentários enviados!')

    def show_error(self, msg):
        # Não mostrar popup, apenas logar o erro
        self.log(msg)
        self.btn_send.setEnabled(True)

def main():
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec_())

# Função de log para MainWindow
MainWindow.log = lambda self, msg: self.log_box.append(msg)

if __name__ == '__main__':
    main()
