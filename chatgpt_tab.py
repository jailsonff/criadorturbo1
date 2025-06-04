import openai
from PyQt5.QtWidgets import (QWidget, QVBoxLayout, QTextEdit, QPushButton, QLabel)

class ChatGPTTab(QWidget):
    def __init__(self, openai_api_key):
        super().__init__()
        self.api_key = openai_api_key
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout()
        self.prompt_label = QLabel('Digite sua pergunta para o ChatGPT:')
        self.input_text = QTextEdit()
        self.send_btn = QPushButton('Enviar')
        self.response_text = QTextEdit()
        self.response_text.setReadOnly(True)
        layout.addWidget(self.prompt_label)
        layout.addWidget(self.input_text)
        layout.addWidget(self.send_btn)
        layout.addWidget(QLabel('Resposta:'))
        layout.addWidget(self.response_text)
        self.setLayout(layout)
        self.send_btn.clicked.connect(self.send_prompt)

    def send_prompt(self):
        prompt = self.input_text.toPlainText().strip()
        if not prompt:
            return
        openai.api_key = self.api_key
        try:
            response = openai.ChatCompletion.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}]
            )
            answer = response.choices[0].message.content
            self.response_text.setPlainText(answer)
        except Exception as e:
            self.response_text.setPlainText(f"Erro: {e}")
