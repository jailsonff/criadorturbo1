#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Bot Concorrente - Processa até 5 clientes simultaneamente, cada um com seus comentários.
"""
import json
import time
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from bot_processor import (
    load_pending_orders,
    save_pending_orders,
    save_processed_order,
    load_instagram_users,
    process_comment_order,
    logger,
)

MAX_CLIENTES_CONCORRENTES = 5
PEDIDOS_FILE = 'pedidos_pendentes.json'
PROCESSED_FILE = 'pedidos_processados.json'

def processar_todos_comentarios_cliente(order, usuarios_disponiveis):
    """Processa todos os comentários de um cliente, um por vez, usando um login diferente para cada comentário."""
    comentarios = order.get('comentarios', [])
    total = len(comentarios)
    sucesso = 0
    for idx, comentario in enumerate(comentarios):
        if not usuarios_disponiveis:
            logger.error(f"Sem usuários disponíveis para o pedido {order['id']}")
            break
        usuario = usuarios_disponiveis.pop(0)
        logger.info(f"[Cliente {order.get('cliente', order['id'])}] Comentário {idx+1}/{total} usando login {usuario['username']}")
        ok, msg = process_comment_order(order, usuario, comment_index=idx)
        usuarios_disponiveis.append(usuario)  # Libera usuário para o próximo comentário
        if ok:
            sucesso += 1
        else:
            logger.warning(f"Comentário {idx+1} do pedido {order['id']} falhou: {msg}")
        # Aqui garantimos que só um comentário é processado por vez para este cliente
        # (o loop é sequencial, nunca paralelo para o mesmo cliente)
    if sucesso == total:
        logger.info(f"Todos os comentários do pedido {order['id']} foram processados com sucesso!")
        save_processed_order(order, success=True, message="Todos os comentários postados!")
        return True
    else:
        logger.warning(f"Pedido {order['id']} processado parcialmente.")
        save_processed_order(order, success=False, message="Processado parcialmente.")
        return False

def main():
    while True:
        pedidos = load_pending_orders()
        if not pedidos:
            logger.info("Nenhum pedido pendente. Aguardando 10 segundos...")
            time.sleep(10)
            continue
        usuarios = load_instagram_users()
        if not usuarios:
            logger.error("Nenhum usuário do Instagram disponível!")
            time.sleep(30)
            continue
        # Agrupar pedidos por cliente (cada pedido é de um cliente)
        pedidos_na_fila = pedidos.copy()
        logger.info(f"Total de pedidos na fila: {len(pedidos_na_fila)}")
        with ThreadPoolExecutor(max_workers=MAX_CLIENTES_CONCORRENTES) as executor:
            futuros = {}
            while pedidos_na_fila or futuros:
                # Preencher até 5 slots
                while len(futuros) < MAX_CLIENTES_CONCORRENTES and pedidos_na_fila:
                    pedido = pedidos_na_fila.pop(0)
                    logger.info(f"Adicionando pedido {pedido['id']} do cliente {pedido.get('cliente', '')} à fila concorrente.")
                    futuros[executor.submit(processar_todos_comentarios_cliente, pedido, usuarios)] = pedido
                # Esperar qualquer um terminar
                done, _ = next(as_completed(futuros), (None, None))
                if done:
                    pedido_finalizado = futuros.pop(done)
                    logger.info(f"Pedido {pedido_finalizado['id']} finalizado. Liberando slot...")
        logger.info("Ciclo de processamento concorrente concluído. Aguardando 10 segundos para nova varredura...")
        time.sleep(10)

if __name__ == "__main__":
    main()
