"""
Script para limpeza segura do Bot Instagram
Mantém apenas os arquivos essenciais identificados pelo analisador de dependências
"""
import os
import shutil
import time
import json

# Arquivos Python essenciais identificados
ARQUIVOS_PYTHON_ESSENCIAIS = [
    "main.py",
    "cookies_optimizer.py",
    "worker.py",
    "verificador_curtida.py",
    "dolphin_anty_optimized.py",
    "gui.py",
    "automacao_worker_final.py",
    # Scripts de manutenção
    "analisador_dependencias.py",
    "limpar_seguro.py"
]

# Diretórios essenciais identificados
DIRETORIOS_ESSENCIAIS = [
    "sessions_otimizadas",
    "dolphin_profiles",
    "assets",
    "screenshots"  # Incluído por segurança
]

# Arquivos de configuração essenciais
ARQUIVOS_CONFIG_ESSENCIAIS = [
    "contas.txt",
    "contas_criadas.txt",
    "instagram_bot_config_v2.3.ini",
    "instagram_bot_config_v2.4.ini",
    "limpeza_log.txt",
    "limpeza_ultra_log.txt",
    "usuarios_instagram.json",
    "relatorio_dependencias.json"
]

def confirmar_acao(mensagem):
    """Solicita confirmação do usuário."""
    resposta = input(f"{mensagem} (s/n): ").strip().lower()
    return resposta == 's' or resposta == 'sim'

def criar_backup(diretorio_projeto):
    """Cria um backup dos arquivos essenciais."""
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    backup_dir = f"{diretorio_projeto}_backup_seguro_{timestamp}"
    os.makedirs(backup_dir, exist_ok=True)
    
    print(f"Criando backup em: {backup_dir}")
    
    # Copiar arquivos Python essenciais
    for arquivo in ARQUIVOS_PYTHON_ESSENCIAIS:
        origem = os.path.join(diretorio_projeto, arquivo)
        if os.path.exists(origem):
            shutil.copy2(origem, backup_dir)
            print(f"  ✓ Copiado: {arquivo}")
    
    # Copiar arquivos de configuração
    for arquivo in ARQUIVOS_CONFIG_ESSENCIAIS:
        origem = os.path.join(diretorio_projeto, arquivo)
        if os.path.exists(origem):
            shutil.copy2(origem, backup_dir)
            print(f"  ✓ Copiado: {arquivo}")
    
    # Copiar diretórios essenciais (exceto dolphin_profiles que pode ser grande)
    for diretorio in DIRETORIOS_ESSENCIAIS:
        if diretorio == "dolphin_profiles":
            # Para dolphin_profiles, copiar apenas o arquivo centralizado de metadados
            origem = os.path.join(diretorio_projeto, diretorio)
            destino = os.path.join(backup_dir, diretorio)
            if os.path.exists(origem):
                os.makedirs(destino, exist_ok=True)
                metadata_file = os.path.join(origem, "all_profiles_metadata.json")
                if os.path.exists(metadata_file):
                    shutil.copy2(metadata_file, os.path.join(destino, "all_profiles_metadata.json"))
                    print(f"  ✓ Copiado: {diretorio}/all_profiles_metadata.json")
        else:
            origem = os.path.join(diretorio_projeto, diretorio)
            destino = os.path.join(backup_dir, diretorio)
            if os.path.exists(origem):
                shutil.copytree(origem, destino)
                print(f"  ✓ Copiado diretório: {diretorio}")
    
    return backup_dir

def limpar_arquivos_nao_essenciais(diretorio_projeto):
    """Remove todos os arquivos não essenciais do projeto."""
    arquivos_removidos = 0
    diretorios_removidos = 0
    
    # Lista de todos os arquivos e diretórios a preservar
    preservar_arquivos = ARQUIVOS_PYTHON_ESSENCIAIS + ARQUIVOS_CONFIG_ESSENCIAIS
    preservar_diretorios = DIRETORIOS_ESSENCIAIS
    
    # Criar log da limpeza
    log_file = os.path.join(diretorio_projeto, "limpeza_segura_log.txt")
    with open(log_file, 'w', encoding='utf-8') as log:
        log.write(f"Log de limpeza - {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        log.write("-" * 50 + "\n\n")
        
        # Listar todos os itens no diretório do projeto
        for item in os.listdir(diretorio_projeto):
            caminho_completo = os.path.join(diretorio_projeto, item)
            
            # Ignorar o backup recém-criado
            if "_backup_seguro_" in item:
                continue
                
            # Verificar diretórios
            if os.path.isdir(caminho_completo):
                if item not in preservar_diretorios:
                    # Remover diretório não essencial
                    try:
                        tamanho = calcular_tamanho_diretorio(caminho_completo)
                        tamanho_formatado = formatar_tamanho(tamanho)
                        
                        shutil.rmtree(caminho_completo)
                        log.write(f"Removido diretório: {item} ({tamanho_formatado})\n")
                        print(f"🗑️ Removido diretório: {item} ({tamanho_formatado})")
                        diretorios_removidos += 1
                    except Exception as e:
                        log.write(f"Erro ao remover diretório {item}: {e}\n")
                        print(f"⚠️ Erro ao remover diretório {item}: {e}")
            
            # Verificar arquivos
            elif os.path.isfile(caminho_completo):
                if item not in preservar_arquivos:
                    # Remover arquivo não essencial
                    try:
                        tamanho = os.path.getsize(caminho_completo)
                        tamanho_formatado = formatar_tamanho(tamanho)
                        
                        os.remove(caminho_completo)
                        log.write(f"Removido arquivo: {item} ({tamanho_formatado})\n")
                        print(f"🗑️ Removido arquivo: {item} ({tamanho_formatado})")
                        arquivos_removidos += 1
                    except Exception as e:
                        log.write(f"Erro ao remover arquivo {item}: {e}\n")
                        print(f"⚠️ Erro ao remover arquivo {item}: {e}")
        
        # Adicionar resumo ao log
        log.write(f"\nTotal de arquivos removidos: {arquivos_removidos}\n")
        log.write(f"Total de diretórios removidos: {diretorios_removidos}\n")
    
    return arquivos_removidos, diretorios_removidos

def calcular_tamanho_diretorio(diretorio):
    """Calcula o tamanho total de um diretório em bytes."""
    tamanho_total = 0
    for raiz, _, arquivos in os.walk(diretorio):
        for arquivo in arquivos:
            caminho_arquivo = os.path.join(raiz, arquivo)
            try:
                tamanho_total += os.path.getsize(caminho_arquivo)
            except:
                pass
    return tamanho_total

def formatar_tamanho(tamanho_bytes):
    """Formata o tamanho em bytes para uma representação legível."""
    if tamanho_bytes < 1024:
        return f"{tamanho_bytes} bytes"
    elif tamanho_bytes < 1024 * 1024:
        return f"{tamanho_bytes / 1024:.2f} KB"
    elif tamanho_bytes < 1024 * 1024 * 1024:
        return f"{tamanho_bytes / (1024 * 1024):.2f} MB"
    else:
        return f"{tamanho_bytes / (1024 * 1024 * 1024):.2f} GB"

def limpar_profiles_nao_otimizados(diretorio_projeto):
    """Limpa perfis na pasta dolphin_profiles que já estão otimizados."""
    dolphin_dir = os.path.join(diretorio_projeto, "dolphin_profiles")
    otimizados_dir = os.path.join(diretorio_projeto, "sessions_otimizadas")
    
    if not os.path.exists(dolphin_dir) or not os.path.exists(otimizados_dir):
        print("⚠️ Pasta de perfis ou de sessões otimizadas não encontrada.")
        return 0
    
    perfis_removidos = 0
    espaco_liberado = 0
    
    # Obter lista de perfis otimizados
    perfis_otimizados = set()
    for item in os.listdir(otimizados_dir):
        if os.path.isdir(os.path.join(otimizados_dir, item)):
            perfis_otimizados.add(item)
    
    # Salvar o arquivo de metadados centralizado
    metadata_file = os.path.join(dolphin_dir, "all_profiles_metadata.json")
    metadata_content = None
    if os.path.exists(metadata_file):
        try:
            with open(metadata_file, 'r', encoding='utf-8') as f:
                metadata_content = f.read()
        except:
            print("⚠️ Não foi possível ler o arquivo all_profiles_metadata.json")
    
    # Percorrer perfis na pasta dolphin_profiles
    for item in os.listdir(dolphin_dir):
        caminho_completo = os.path.join(dolphin_dir, item)
        # Não remover arquivo de metadados
        if item == "all_profiles_metadata.json":
            continue
            
        if os.path.isdir(caminho_completo) and item in perfis_otimizados:
            try:
                tamanho = calcular_tamanho_diretorio(caminho_completo)
                espaco_liberado += tamanho
                shutil.rmtree(caminho_completo)
                print(f"🗑️ Removido perfil já otimizado: {item} ({formatar_tamanho(tamanho)})")
                perfis_removidos += 1
            except Exception as e:
                print(f"⚠️ Erro ao remover perfil {item}: {e}")
    
    # Restaurar o arquivo de metadados centralizado se necessário
    if metadata_content and not os.path.exists(metadata_file):
        try:
            with open(metadata_file, 'w', encoding='utf-8') as f:
                f.write(metadata_content)
            print("✅ Arquivo all_profiles_metadata.json restaurado.")
        except:
            print("⚠️ Não foi possível restaurar o arquivo all_profiles_metadata.json")
    
    return perfis_removidos, espaco_liberado

def main():
    """Função principal do script."""
    print("=" * 60)
    print("LIMPEZA SEGURA DO BOT INSTAGRAM")
    print("=" * 60)
    print(f"Data e hora: {time.strftime('%d/%m/%Y %H:%M:%S')}")
    print("\nEste script irá limpar todos os arquivos não essenciais do projeto,")
    print("mantendo apenas o necessário para o funcionamento do bot.")
    print("\nArquivos que serão mantidos:")
    
    print("\n1. Arquivos Python essenciais:")
    for arquivo in ARQUIVOS_PYTHON_ESSENCIAIS:
        print(f"  - {arquivo}")
    
    print("\n2. Diretórios essenciais:")
    for diretorio in DIRETORIOS_ESSENCIAIS:
        print(f"  - {diretorio}")
    
    print("\n3. Arquivos de configuração:")
    for config in ARQUIVOS_CONFIG_ESSENCIAIS:
        print(f"  - {config}")
    
    print("\nTodos os outros arquivos e diretórios serão removidos.")
    
    # Obter diretório do projeto
    diretorio_projeto = os.path.dirname(os.path.abspath(__file__))
    
    # Verificar sessões otimizadas
    sessoes_dir = os.path.join(diretorio_projeto, "sessions_otimizadas")
    if not os.path.exists(sessoes_dir) or len(os.listdir(sessoes_dir)) == 0:
        print("\n⚠️ AVISO: Não foram encontrados perfis otimizados!")
        print("É recomendável otimizar os perfis antes de remover os originais.")
        if not confirmar_acao("Deseja continuar mesmo assim?"):
            print("Operação cancelada. Por favor, execute o otimizador de perfis primeiro.")
            return
    
    # Confirmar limpeza
    if not confirmar_acao("\nDeseja prosseguir com a limpeza?"):
        print("Operação cancelada pelo usuário.")
        return
    
    # Criar backup
    backup_dir = criar_backup(diretorio_projeto)
    print(f"\n✅ Backup criado em: {backup_dir}")
    
    # Limpar perfis já otimizados
    print("\nLimpando perfis já otimizados...")
    perfis_removidos, espaco_perfis = limpar_profiles_nao_otimizados(diretorio_projeto)
    print(f"Removidos {perfis_removidos} perfis já otimizados, liberando {formatar_tamanho(espaco_perfis)}")
    
    # Remover arquivos não essenciais
    print("\nRemovendo arquivos não essenciais...")
    arquivos_removidos, diretorios_removidos = limpar_arquivos_nao_essenciais(diretorio_projeto)
    
    # Exibir resumo
    print("\n" + "=" * 60)
    print("LIMPEZA CONCLUÍDA!")
    print("=" * 60)
    print(f"Total de arquivos removidos: {arquivos_removidos}")
    print(f"Total de diretórios removidos: {diretorios_removidos}")
    print(f"Total de perfis otimizados removidos: {perfis_removidos}")
    print(f"\nLog da limpeza salvo em: limpeza_segura_log.txt")
    print(f"Backup dos arquivos essenciais salvo em: {backup_dir}")
    print("\nAgora o projeto contém apenas os arquivos essenciais para o funcionamento do bot.")

if __name__ == "__main__":
    main()
