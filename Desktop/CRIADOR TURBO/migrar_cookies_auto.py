import os
import json
import shutil

"""
Script AUTOMÁTICO para migrar cookies do formato antigo (pastas) para o novo formato (arquivos JSON individuais)
e remover as pastas antigas SEM perguntar nada ao usuário.
"""

def migrar_cookies_para_novo_formato():
    sessions_dir = "sessions_otimizadas"
    migrados = 0
    falhas = 0
    print("\n==== MIGRAÇÃO DE COOKIES PARA NOVO FORMATO ====\n")
    for username in os.listdir(sessions_dir):
        perfil_dir = os.path.join(sessions_dir, username)
        if not os.path.isdir(perfil_dir):
            continue
        cookies_file = os.path.join(perfil_dir, "cookies.json")
        if not os.path.exists(cookies_file):
            continue
        try:
            with open(cookies_file, 'r', encoding='utf-8') as f:
                cookies = json.load(f)
            novo_arquivo = os.path.join(sessions_dir, f"{username}.json")
            with open(novo_arquivo, 'w', encoding='utf-8') as f:
                json.dump(cookies, f, ensure_ascii=False, indent=2)
            migrados += 1
        except Exception as e:
            print(f"Erro ao migrar {username}: {str(e)}")
            falhas += 1
    print(f"Perfis migrados: {migrados}")
    print(f"Falhas: {falhas}")
    return migrados

def limpar_pastas_antigas():
    sessions_dir = "sessions_otimizadas"
    removidas = 0
    espaco_liberado = 0
    for item in os.listdir(sessions_dir):
        item_path = os.path.join(sessions_dir, item)
        if os.path.isdir(item_path):
            try:
                tamanho = 0
                for root, dirs, files in os.walk(item_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        try:
                            tamanho += os.path.getsize(file_path)
                        except:
                            pass
                shutil.rmtree(item_path)
                espaco_liberado += tamanho
                removidas += 1
            except Exception as e:
                print(f"Erro ao remover {item}: {str(e)}")
    if espaco_liberado > 1024 * 1024 * 1024:
        espaco_str = f"{espaco_liberado / (1024 * 1024 * 1024):.2f} GB"
    else:
        espaco_str = f"{espaco_liberado / (1024 * 1024):.2f} MB"
    print(f"Pastas removidas: {removidas}")
    print(f"Espaço liberado: {espaco_str}")

if __name__ == "__main__":
    print("Iniciando migração e limpeza automática...")
    migrar_cookies_para_novo_formato()
    limpar_pastas_antigas()
    print("Processo finalizado!")
