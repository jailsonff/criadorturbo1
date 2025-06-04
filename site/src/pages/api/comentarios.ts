import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// Caminho para o arquivo que o bot Python vai monitorar
const PEDIDOS_PATH = path.join(process.cwd(), '..', 'pedidos_pendentes.json');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { link, comentarios, cliente, email } = req.body;
    
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
      status: 'pendente',
      data_criacao: new Date().toISOString(),
      data_processamento: null
    };

    // Lê os pedidos existentes ou cria um array vazio se o arquivo não existir
    let pedidos = [];
    try {
      if (fs.existsSync(PEDIDOS_PATH)) {
        const conteudo = fs.readFileSync(PEDIDOS_PATH, 'utf8');
        pedidos = JSON.parse(conteudo);
      }
    } catch (error) {
      console.error('Erro ao ler arquivo de pedidos:', error);
      // Se ocorrer erro na leitura, iniciamos com um array vazio
      pedidos = [];
    }

    // Adiciona o novo pedido e salva o arquivo
    pedidos.push(pedido);
    fs.writeFileSync(PEDIDOS_PATH, JSON.stringify(pedidos, null, 2));

    // Descontar créditos de comentários do cliente
    try {
      const CLIENTES_PATH = path.join(process.cwd(), '..', 'clientes.json');
      if (fs.existsSync(CLIENTES_PATH)) {
        const clientesRaw = fs.readFileSync(CLIENTES_PATH, 'utf8');
        const clientes = JSON.parse(clientesRaw);
        const idx = clientes.findIndex((c:any) => c.email === email);
        if (idx !== -1) {
          let saldoAtual = Number(clientes[idx].comentarios) || 0;
          let descontar = comentarios.length;
          let novoSaldo = saldoAtual - descontar;
          if (novoSaldo < 0) novoSaldo = 0;
          clientes[idx].comentarios = novoSaldo;
          fs.writeFileSync(CLIENTES_PATH, JSON.stringify(clientes, null, 2));
        }
      }
    } catch (erroDesconto) {
      console.error('Erro ao descontar créditos do cliente:', erroDesconto);
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
