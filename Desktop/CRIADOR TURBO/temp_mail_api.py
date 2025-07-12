import requests
import time
import random
import string
import re

API_URL = "https://temp-mail-org4.p.rapidapi.com"

def generate_random_string(length=10):
    """Gera uma string aleatória de letras e números."""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def get_available_domains(api_key):
    """Busca a lista de domínios disponíveis na API."""
    url = f"{API_URL}/request/domains/"
    headers = {
        "x-rapidapi-host": "temp-mail-org4.p.rapidapi.com",
        "x-rapidapi-key": api_key
    }
    try:
        response = requests.get(url, headers=headers, timeout=15) # Timeout de 15s
        response.raise_for_status()  # Lança exceção para status de erro
        domains = response.json()
        if isinstance(domains, list) and len(domains) > 0:
            return domains
        print("API não retornou uma lista de domínios válida.")
        return None
    except requests.RequestException as e:
        print(f"Erro ao buscar domínios da API: {e}")
        return None

def generate_temp_email(api_key):
    """Gera um novo endereço de e-mail temporário."""
    domains = get_available_domains(api_key)
    if not domains:
        return None, "Não foi possível obter domínios da API. Verifique sua chave ou a conexão."

    username = generate_random_string()
    domain = random.choice(domains)
    
    # A API pode retornar domínios com ou sem '@'. Normalizamos aqui.
    if "@" in domain:
        email = f"{username}{domain}"
    else:
        email = f"{username}@{domain}"

    return email, None

def check_for_instagram_code(api_key, email_address, timeout=180):
    """
    Verifica a caixa de entrada de um e-mail em busca do código de verificação do Instagram.
    Retorna o código se encontrado, ou None se o tempo esgotar.
    """
    start_time = time.time()
    url = f"{API_URL}/request/mail/id/{email_address}/"
    headers = {
        "x-rapidapi-host": "temp-mail-org4.p.rapidapi.com",
        "x-rapidapi-key": api_key
    }

    print(f"Iniciando verificação de e-mail para: {email_address}")
    while time.time() - start_time < timeout:
        try:
            # Adicionado timeout para a requisição
            response = requests.get(url, headers=headers, timeout=20)
            
            # Se a caixa de entrada estiver vazia, a API retorna 404. Isso é esperado.
            if response.status_code == 404:
                # print(f"Caixa de entrada para {email_address} ainda vazia. Tentando novamente em 10s...")
                time.sleep(10)
                continue
            
            # Lança exceção para outros erros HTTP (ex: 401, 500)
            response.raise_for_status()
            messages = response.json()

            if messages:
                for message in messages:
                    mail_from = message.get("mail_from", "").lower()
                    mail_subject = message.get("mail_subject", "").lower()

                    # Procura por e-mails do Instagram
                    if "instagram" in mail_from or "instagram" in mail_subject:
                        mail_text = message.get("mail_text", "") or message.get("mail_text_only", "")
                        
                        # Extrai o código de 6 dígitos
                        match = re.search(r'\b(\d{6})\b', mail_text)
                        if match:
                            code = match.group(1)
                            print(f"Código do Instagram encontrado: {code}")
                            return code, None
            
            # print("Nenhum e-mail do Instagram ainda. Aguardando 10 segundos...")
            time.sleep(10)

        except requests.exceptions.RequestException as e:
            # Trata erros de rede (conexão, timeout) sem parar o processo.
            # Continua tentando até o timeout principal da função.
            print(f"⚠️ Erro de rede ao verificar e-mails: {e}. Tentando novamente em 15s...")
            time.sleep(15)
            continue
        except Exception as e:
            # Para erros inesperados (ex: JSON inválido), falha e retorna o erro.
            error_message = f"❌ Ocorreu um erro inesperado ao processar e-mails: {e}"
            print(error_message)
            return None, error_message
            
    return None, "Tempo esgotado. Nenhum código de verificação do Instagram recebido."
