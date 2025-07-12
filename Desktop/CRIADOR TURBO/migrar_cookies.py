import os
import json
import shutil

"""
Script para migrar cookies do formato antigo (pastas) para o novo formato (arquivos JSON individuais)
Após a migração, as pastas antigas podem ser excluídas para economizar espaço
"""

def migrar_cookies_para_novo_formato():
    # Diretório das sessões otimizadas
    sessions_dir = "sessions_otimizadas"
    
    # Contador de perfis migrados
    migrados = 0
    falhas = 0
    
    print("\n==== MIGRAÇÃO DE COOKIES PARA NOVO FORMATO ====\n")
    print("Migrando cookies de pastas para arquivos JSON individuais...\n")
    
    # Verificar cada pasta de usuário
    for username in os.listdir(sessions_dir):
        # Ignorar arquivos que não são pastas
        perfil_dir = os.path.join(sessions_dir, username)
        if not os.path.isdir(perfil_dir):
            continue
        
        # Verificar se existe arquivo de cookies na pasta
        cookies_file = os.path.join(perfil_dir, "cookies.json")
        if not os.path.exists(cookies_file):
            continue
        
        try:
            # Carregar cookies do arquivo atual
            with open(cookies_file, 'r', encoding='utf-8') as f:
                cookies = json.load(f)
            
            # Salvar no novo formato (arquivo único com nome do usuário)
            novo_arquivo = os.path.join(sessions_dir, f"{username}.json")
            with open(novo_arquivo, 'w', encoding='utf-8') as f:
                json.dump(cookies, f, ensure_ascii=False, indent=2)
            
            tamanho_kb = round(os.path.getsize(novo_arquivo) / 1024, 2)
            print(f"✓ Migrado: {username}.json ({tamanho_kb} KB)")
            migrados += 1
            
        except Exception as e:
            print(f"✗ Erro ao migrar {username}: {str(e)}")
            falhas += 1
    
    print(f"\nMigração concluída!\n")
    print(f"Total de perfis migrados: {migrados}")
    print(f"Falhas na migração: {falhas}")
    print("\nAgora você pode excluir as pastas antigas para economizar espaço.")
    print("Use o comando: python limpar_pastas_antigas.py")


# Executar a migração
if __name__ == "__main__":
    migrar_cookies_para_novo_formato()
