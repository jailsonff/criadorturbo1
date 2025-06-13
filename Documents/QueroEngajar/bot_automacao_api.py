import time
import requests
import traceback

API_BASE_URL = "http://localhost:3001/api"  # Ajuste para o endereço/porta do backend antigo

# Loop principal para monitorar pedidos a cada 10 segundos
def monitorar_pedidos():
    print("[BOT] Monitorando pedidos de comentários...")
    while True:
        try:
            # Buscar pedidos pendentes
            resp = requests.get(f"{API_BASE_URL}/status-pedidos")
            if resp.status_code != 200:
                print("[BOT] Erro ao buscar pedidos pendentes:", resp.text)
                time.sleep(10)
                continue
            data = resp.json()
            pedidos_pendentes = data.get("pendentes", [])
            if not pedidos_pendentes:
                print("[BOT] Nenhum pedido pendente encontrado.")
                time.sleep(10)
                continue
            # Só processa pedidos com status pendente
            for pedido in pedidos_pendentes:
                if pedido.get("status") == "pendente":
                    print(f"[BOT] Processando pedido {pedido.get('id') or pedido.get('link')} de {pedido.get('cliente')}")
                    processar_pedido(pedido)
                    break  # processa um por vez, depois volta pro loop
            else:
                print("[BOT] Nenhum pedido pendente a processar (todos já processados).")
        except Exception as e:
            print("[BOT] Erro no loop principal:", e)
            traceback.print_exc()
        time.sleep(10)

def processar_pedido(pedido):
    id_pedido = pedido.get('id')
    email = pedido.get('email')
    comentarios = pedido.get('comentarios', [])
    link = pedido.get('link')
    cliente = pedido.get('cliente')
    genero = pedido.get('generoComentario', 'misto')
    total = len(comentarios)
    realizados = 0
    falhas = 0
    usados_por_genero = {
        'feminino': set(),
        'masculino': set(),
        'aleatorios': set(),
    }
    generos_tentados = []
    def generos_para_tentar(gen):
        if gen == 'feminino':
            return ['feminino', 'masculino']
        elif gen == 'masculino':
            return ['masculino', 'feminino']
        else:
            return ['feminino', 'masculino']
    for idx, comentario in enumerate(comentarios):
        sucesso = False
        msg = ''
        for genero_tentativa in generos_para_tentar(genero):
            if genero_tentativa in generos_tentados and not sucesso:
                continue
            usados = usados_por_genero[genero_tentativa]
            tentativas = 0
            # Tenta uma vez por perfil. Se falhar, a função de automação já é robusta.
            ok, retorno = executar_comentario(cliente, comentario, link, usados, genero_tentativa)
            if ok:
                realizados += 1
                print(f"[BOT] Comentário {idx+1}/{total} realizado com sucesso pelo perfil do gênero {genero_tentativa}.")
                sucesso = True
                break # Sai do loop de generos e vai para o próximo comentário
            else:
                print(f"[BOT] Falha ao comentar {idx+1}/{total} com perfil do gênero {genero_tentativa}: {retorno}")
                # Se não houver mais usuários disponíveis desse gênero, registra e tenta o próximo gênero
                if "Nenhum usuário disponível" in retorno:
                    generos_tentados.append(genero_tentativa)
                else:
                    # Se a falha foi outra (ex: bloqueio do insta), não adianta tentar outro perfil.
                    # Quebra o loop de generos e marca como falha.
                    sucesso = False
                    break
            if sucesso:
                break
        if not sucesso:
            falhas += 1
            print(f"[BOT] Falha definitiva ao comentar {idx+1}/{total} após tentar todos os perfis disponíveis.")
    status = 'concluido' if realizados == total else 'falha' if realizados == 0 else 'parcial'
    atualizar_status_pedido(id_pedido, status, realizados, falhas)
    print(f"[BOT] Pedido {id_pedido} processado: {realizados} sucesso(s), {falhas} falha(s). Status final: {status}")

def executar_comentario(cliente, comentario, link, usados=None, genero=None):
    # Seleciona um usuário diferente para cada comentário e move para o final do arquivo
    import os
    if usados is None:
        usados = set()
    def pegar_e_rotacionar_usuario(arquivos, usados):
        for filename in arquivos:
            if not os.path.exists(filename):
                continue
            with open(filename, "r", encoding="utf-8") as f:
                linhas = [l.strip() for l in f if l.strip() and ":" in l]
            # Procura o primeiro usuário não usado ainda neste pedido
            idx_nao_usado = None
            for idx, linha in enumerate(linhas):
                usuario, _ = linha.split(":", 1)
                if usuario not in usados:
                    idx_nao_usado = idx
                    break
            if idx_nao_usado is None:
                continue
            usuario_linha = linhas.pop(idx_nao_usado)
            linhas.append(usuario_linha)  # move o usuário usado para o final
            with open(filename, "w", encoding="utf-8") as f:
                f.write("\n".join(linhas) + "\n")
            usuario, senha = usuario_linha.split(":", 1)
            return usuario, senha
        return None, None
    # Seleciona o(s) arquivo(s) conforme o gênero
    if genero == 'feminino':
        arquivos = ["usuarios_femininos.txt"]
    elif genero == 'masculino':
        arquivos = ["usuarios_masculinos.txt"]
    else:
        arquivos = ["usuarios_masculinos.txt", "usuarios_femininos.txt"]
    usuario, senha = pegar_e_rotacionar_usuario(arquivos, usados)
    if not usuario or not senha:
        return False, "Nenhum usuário disponível nos arquivos de usuários ou todos já usados neste pedido."
    usados.add(usuario)
    try:
        from utils import comentar_post
        print(f"[DEBUG] Chamando 'comentar_post' com o usuário: {usuario}")
        ok, msg = comentar_post(usuario, senha, link, comentario)
        print(f"[DEBUG] Retorno de 'comentar_post': ok={ok}, msg='{msg}'")
        return ok, msg
    except Exception as e:
        print("[DEBUG] Uma exceção foi capturada em 'executar_comentario':")
        traceback.print_exc() # Imprime o traceback completo no console
        return False, f"Erro ao executar automação: {e}"

def estornar_credito(email, quantidade, motivo="Falha na automação"):
    try:
        resp = requests.post(f"{API_BASE_URL}/creditos", json={"email": email, "quantidade": quantidade, "motivo": motivo})
        if resp.status_code == 200:
            print(f"[BOT] Estornado {quantidade} crédito(s) para {email}. Motivo: {motivo}")
        else:
            print(f"[BOT] Falha ao estornar crédito: {resp.text}")
    except Exception as e:
        print(f"[BOT] Erro ao estornar crédito: {e}")

def atualizar_status_pedido(id_pedido, status, realizados, falhas):
    try:
        # PUT para atualizar o pedido
        payload = {
            "id": id_pedido,
            "tipo": "pendente",
            "status": status,
            "realizados": realizados,
            "falhas": falhas,
            "mensagem": f"{realizados} sucesso(s), {falhas} falha(s)"
        }
        resp = requests.put(f"{API_BASE_URL}/pedidos", json=payload)
        if resp.status_code == 200:
            print(f"[BOT] Status do pedido atualizado para {status}")
        else:
            print(f"[BOT] Falha ao atualizar status do pedido: {resp.text}")
    except Exception as e:
        print(f"[BOT] Erro ao atualizar status do pedido: {e}")

if __name__ == "__main__":
    monitorar_pedidos()
