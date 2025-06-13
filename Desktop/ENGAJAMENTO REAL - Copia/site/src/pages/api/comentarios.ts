import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';

// Caminho para o arquivo que o bot Python vai monitorar
const PEDIDOS_PATH = path.join(process.cwd(), '..', 'pedidos_pendentes.json');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { link, comentarios, cliente, email, generoComentario } = req.body;
    
    if (!link || !comentarios || !Array.isArray(comentarios) || comentarios.length === 0) {
      return res.status(400).json({ 
        error: 'Dados inválidos', 
        detalhes: 'É necessário fornecer um link e uma lista de comentários' 
      });
    }

    // Estrutura do pedido para o bot Python processar
    const pedido = {
      id: Date.now().toString(),
      link,
      comentarios,
      cliente,
      email,
      generoComentario: generoComentario || 'misto',
      status: 'pendente',
      data_criacao: new Date().toISOString(),
      data_processamento: null
    };


    // Lê e salva pedidos com proteção de lock
    let pedidos = [];
    let pedidosUnlock;
    try {
      if (fs.existsSync(PEDIDOS_PATH)) {
        pedidosUnlock = await lockfile.lock(PEDIDOS_PATH, { retries: 10, stale: 15000 });
        const conteudo = fs.readFileSync(PEDIDOS_PATH, 'utf8');
        pedidos = JSON.parse(conteudo);
      } else {
        // Cria o arquivo se não existir
        fs.writeFileSync(PEDIDOS_PATH, '[]');
        pedidosUnlock = await lockfile.lock(PEDIDOS_PATH, { retries: 10, stale: 15000 });
        pedidos = [];
      }
    } catch (error) {
      console.error('Erro ao ler/lock arquivo de pedidos:', error);
      pedidos = [];
    }

    // Adiciona o novo pedido e salva o arquivo
    pedidos.push(pedido);
    try {
      fs.writeFileSync(PEDIDOS_PATH, JSON.stringify(pedidos, null, 2));
    } finally {
      if (pedidosUnlock) await pedidosUnlock();
    }

    // Estorno automático de créditos para pedidos não processados em até 1 hora
    try {
      const CLIENTES_PATH = path.join(process.cwd(), '..', 'clientes.json');
      let clientesUnlock;
      let clientes = [];
      if (fs.existsSync(CLIENTES_PATH)) {
        clientesUnlock = await lockfile.lock(CLIENTES_PATH, { retries: 10, stale: 15000 });
        const clientesRaw = fs.readFileSync(CLIENTES_PATH, 'utf8');
        clientes = JSON.parse(clientesRaw);
        const idx = clientes.findIndex((c:any) => c.email === email);
        if (idx !== -1) {
          let saldoAtual = Number(clientes[idx].comentarios) || 0;
          let descontar = comentarios.length;

          // Verificar se há pedidos pendentes desse cliente com mais de 1 hora
          const agora = Date.now();
          const pedidosAntigos = pedidos.filter((p:any) => p.email === email && p.status === 'pendente' && p.data_criacao);
          let estorno = 0;
          pedidosAntigos.forEach((p:any) => {
            const criadoEm = new Date(p.data_criacao).getTime();
            if (agora - criadoEm > 60 * 60 * 1000) { // mais de 1 hora
              estorno += (p.comentarios ? p.comentarios.length : 0);
              // Opcional: pode marcar esse pedido como 'expirado' ou removê-lo
              p.status = 'expirado';
            }
          });
          if (estorno > 0) {
            saldoAtual += estorno;
            // Atualizar status dos pedidos expirados no arquivo
            let pedidosUnlock2 = await lockfile.lock(PEDIDOS_PATH, { retries: 10, stale: 15000 });
            try {
              fs.writeFileSync(PEDIDOS_PATH, JSON.stringify(pedidos, null, 2));
            } finally {
              if (pedidosUnlock2) await pedidosUnlock2();
            }
          }

          let novoSaldo = saldoAtual - descontar;
          if (novoSaldo < 0) novoSaldo = 0;
          clientes[idx].comentarios = novoSaldo;
          fs.writeFileSync(CLIENTES_PATH, JSON.stringify(clientes, null, 2));
        }
      }
      if (clientesUnlock) await clientesUnlock();
    } catch (erroDesconto) {
      console.error('Erro ao descontar/estornar créditos do cliente:', erroDesconto);
    }

    // Retorna sucesso com o ID do pedido
    return res.status(200).json({ 
      success: true, 
      message: 'Pedido recebido com sucesso e será processado pelo bot',
      pedido_id: pedido.id
    });
  } catch (error: any) {
    console.error('Erro ao processar pedido:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao processar pedido', 
      detalhes: error.message 
    });
  }
}
