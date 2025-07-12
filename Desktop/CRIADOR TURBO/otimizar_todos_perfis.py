"""
Script para otimizar TODOS os perfis Dolphin, salvando apenas os cookies essenciais em 'sessions_otimizadas'.
Execute este script sempre que quiser reduzir o espaço usado pelas sessões.
"""
from cookies_optimizer import CookiesOptimizer
from dolphin_anty_optimized import DolphinAntyOptimizedManager
import os

# Caminhos padrão do seu projeto
BASE_PATH = os.path.dirname(os.path.abspath(__file__))
ORIGINAL_PROFILES_DIR = "dolphin_profiles"
OPTIMIZED_SESSIONS_DIR = "sessions_otimizadas"

# Inicializa o otimizador e o Dolphin Manager
optimizer = CookiesOptimizer(
    base_path=BASE_PATH,
    original_profiles_dir=ORIGINAL_PROFILES_DIR,
    optimized_sessions_dir=OPTIMIZED_SESSIONS_DIR
)
dolphin_manager = DolphinAntyOptimizedManager()

# Lista todos os perfis Dolphin existentes
perfis = [
    nome for nome in os.listdir(os.path.join(BASE_PATH, ORIGINAL_PROFILES_DIR))
    if os.path.isdir(os.path.join(BASE_PATH, ORIGINAL_PROFILES_DIR, nome))
]

print(f"Encontrados {len(perfis)} perfis para otimizar.")

for perfil in perfis:
    print(f"Otimizando perfil: {perfil} ...", end=" ")
    sucesso, mensagem = optimizer.otimizar_perfil_existente(perfil, dolphin_manager)
    if sucesso:
        print("OK ✅")
    else:
        print(f"ERRO ❌ - {mensagem}")

print("\nOtimização concluída!")
