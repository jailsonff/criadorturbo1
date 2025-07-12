"""
Analisador de dependências do Bot Instagram
Este script analisa todos os arquivos Python do projeto para identificar quais são necessários
para o funcionamento do bot e cria um relatório detalhado.
"""
import os
import re
import json

def encontrar_arquivos_python(diretorio):
    """Encontra todos os arquivos Python no diretório."""
    arquivos_py = []
    for raiz, _, arquivos in os.walk(diretorio):
        for arquivo in arquivos:
            if arquivo.endswith('.py'):
                caminho_completo = os.path.join(raiz, arquivo)
                arquivos_py.append(caminho_completo)
    return arquivos_py

def analisar_imports(arquivo):
    """Analisa os imports de um arquivo Python."""
    imports = []
    if not os.path.exists(arquivo):
        return imports
    
    try:
        with open(arquivo, 'r', encoding='utf-8', errors='ignore') as f:
            conteudo = f.read()
            
        # Padrão para encontrar imports
        padrao_import = r'^\s*import\s+([\w\.]+)'
        padrao_from = r'^\s*from\s+([\w\.]+)\s+import'
        
        # Encontrar todos os imports
        imports_encontrados = re.finditer(padrao_import, conteudo, re.MULTILINE)
        for match in imports_encontrados:
            modulo = match.group(1)
            imports.append(modulo)
            
        # Encontrar todos os from ... import
        from_imports = re.finditer(padrao_from, conteudo, re.MULTILINE)
        for match in from_imports:
            modulo = match.group(1)
            imports.append(modulo)
    except Exception as e:
        print(f"Erro ao analisar o arquivo {arquivo}: {e}")
    
    return imports

def mapear_imports_para_arquivos(imports, arquivos_py, diretorio):
    """Mapeia os imports para arquivos locais."""
    imports_locais = set()
    for imp in imports:
        # Verificar se o import é um módulo local (não da biblioteca padrão ou pip)
        partes_modulo = imp.split('.')
        primeiro_modulo = partes_modulo[0]
        
        # Procurar arquivo .py correspondente
        for arquivo in arquivos_py:
            nome_arquivo = os.path.basename(arquivo)
            nome_sem_extensao = os.path.splitext(nome_arquivo)[0]
            
            if nome_sem_extensao == primeiro_modulo:
                arquivo_relativo = os.path.relpath(arquivo, diretorio)
                imports_locais.add(arquivo_relativo)
    
    return imports_locais

def analisar_dependencias(diretorio_projeto):
    """Analisa todas as dependências do projeto."""
    arquivos_py = encontrar_arquivos_python(diretorio_projeto)
    
    # Identificar arquivos principais
    arquivos_principais = []
    for arquivo in arquivos_py:
        nome_arquivo = os.path.basename(arquivo)
        if nome_arquivo in ["main.py", "gui.py"]:
            arquivos_principais.append(arquivo)
    
    # Dependências diretas e indiretas
    dependencias = set()
    analisados = set()
    pendentes = [os.path.relpath(arq, diretorio_projeto) for arq in arquivos_principais]
    
    # Analisar dependências recursivamente
    while pendentes:
        arquivo_atual = pendentes.pop(0)
        if arquivo_atual in analisados:
            continue
            
        analisados.add(arquivo_atual)
        dependencias.add(arquivo_atual)
        
        caminho_completo = os.path.join(diretorio_projeto, arquivo_atual)
        imports = analisar_imports(caminho_completo)
        arquivos_importados = mapear_imports_para_arquivos(imports, arquivos_py, diretorio_projeto)
        
        for arq_imp in arquivos_importados:
            if arq_imp not in analisados:
                pendentes.append(arq_imp)
    
    return list(dependencias)

def analisar_diretorios_essenciais(diretorio_projeto):
    """Analisa quais diretórios são essenciais para o funcionamento do bot."""
    diretorios_essenciais = []
    
    # Verificar pasta sessions_otimizadas
    sessoes_dir = os.path.join(diretorio_projeto, "sessions_otimizadas")
    if os.path.exists(sessoes_dir) and os.path.isdir(sessoes_dir):
        diretorios_essenciais.append("sessions_otimizadas")
    
    # Verificar pasta dolphin_profiles
    dolphin_dir = os.path.join(diretorio_projeto, "dolphin_profiles")
    if os.path.exists(dolphin_dir) and os.path.isdir(dolphin_dir):
        diretorios_essenciais.append("dolphin_profiles")
    
    # Verificar pasta screenshots
    screenshots_dir = os.path.join(diretorio_projeto, "screenshots")
    if os.path.exists(screenshots_dir) and os.path.isdir(screenshots_dir):
        diretorios_essenciais.append("screenshots")
    
    # Verificar pasta assets
    assets_dir = os.path.join(diretorio_projeto, "assets")
    if os.path.exists(assets_dir) and os.path.isdir(assets_dir):
        diretorios_essenciais.append("assets")
    
    return diretorios_essenciais

def verificar_arquivos_config(diretorio_projeto):
    """Verifica se existem arquivos de configuração essenciais."""
    arquivos_config = []
    
    # Lista de possíveis arquivos de configuração
    possiveis_configs = [
        "*.json",
        "*.ini",
        "*.cfg",
        "*.txt",
        "*.xml"
    ]
    
    # Verificar arquivos no diretório raiz
    for item in os.listdir(diretorio_projeto):
        caminho_completo = os.path.join(diretorio_projeto, item)
        if os.path.isfile(caminho_completo):
            # Verificar extensões de possíveis arquivos de configuração
            for padrao in possiveis_configs:
                ext = padrao.replace("*", "")
                if item.endswith(ext):
                    # Se for um arquivo de configuração, verificar se tem conteúdo
                    try:
                        tamanho = os.path.getsize(caminho_completo)
                        if tamanho > 0:
                            arquivos_config.append(item)
                    except:
                        pass
    
    return arquivos_config

def gerar_relatorio(diretorio_projeto):
    """Gera um relatório completo de dependências."""
    print("Analisando dependências do bot Instagram...")
    
    # Analisar arquivos Python
    dependencias = analisar_dependencias(diretorio_projeto)
    
    # Analisar diretórios essenciais
    diretorios = analisar_diretorios_essenciais(diretorio_projeto)
    
    # Verificar arquivos de configuração
    configs = verificar_arquivos_config(diretorio_projeto)
    
    # Criar dicionário de resultados
    resultados = {
        "arquivos_python_essenciais": dependencias,
        "diretorios_essenciais": diretorios,
        "arquivos_configuracao": configs
    }
    
    # Salvar relatório em JSON
    caminho_relatorio = os.path.join(diretorio_projeto, "relatorio_dependencias.json")
    with open(caminho_relatorio, 'w', encoding='utf-8') as f:
        json.dump(resultados, f, indent=4, ensure_ascii=False)
    
    # Exibir resultados
    print("\nRELATÓRIO DE ARQUIVOS ESSENCIAIS DO BOT INSTAGRAM")
    print("=" * 50)
    
    print("\nArquivos Python Essenciais:")
    for arquivo in dependencias:
        print(f"  - {arquivo}")
    
    print("\nDiretórios Essenciais:")
    for diretorio in diretorios:
        print(f"  - {diretorio}")
    
    print("\nArquivos de Configuração:")
    for config in configs:
        print(f"  - {config}")
    
    print("\nTotal de arquivos Python essenciais:", len(dependencias))
    print("Total de diretórios essenciais:", len(diretorios))
    print("Total de arquivos de configuração:", len(configs))
    
    print(f"\nRelatório completo salvo em: {caminho_relatorio}")
    print("\nCom esta análise, você pode criar um script de limpeza seguro")
    print("mantendo apenas os arquivos identificados neste relatório.")

if __name__ == "__main__":
    # Obter diretório do projeto
    diretorio_projeto = os.path.dirname(os.path.abspath(__file__))
    gerar_relatorio(diretorio_projeto)
