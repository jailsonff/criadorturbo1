import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// Caminhos para os arquivos de pedidos
const PEDIDOS_PENDENTES_PATH = path.join(process.cwd(), '..', 'pedidos_pendentes.json');
const PEDIDOS_PROCESSADOS_PATH = path.join(process.cwd(), '..', 'pedidos_processados.json');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Obter o pedido a ser atualizado
    const { pedidoId, novoStatus } = req.body;

    if (!pedidoId || !novoStatus) {
      return res.status(400).json({ error: 'ID do pedido e novo status são obrigatórios' });
    }

    // Verificar se o pedido está nos pedidos processados
    const processados = readJsonFile(PEDIDOS_PROCESSADOS_PATH);
    const pedidoProcessado = processados.find((p: any) => p.id === pedidoId);

    if (pedidoProcessado) {
      return res.status(200).json({
        success: true,
        status: pedidoProcessado.status,
        mensagem: pedidoProcessado.mensagem || 'Pedido processado com sucesso'
      });
    }

    // Verificar se o pedido está nos pedidos pendentes
    const pendentes = readJsonFile(PEDIDOS_PENDENTES_PATH);
    const pedidoPendente = pendentes.find((p: any) => p.id === pedidoId);

    if (pedidoPendente) {
      return res.status(200).json({
        success: true,
        status: 'pendente',
        mensagem: 'Pedido ainda está pendente'
      });
    }

    // Se chegou aqui, o pedido não foi encontrado
    return res.status(404).json({
      success: false,
      mensagem: 'Pedido não encontrado'
    });
    
  } catch (error) {
    console.error('Erro ao atualizar status do pedido:', error);
    return res.status(500).json({ 
      error: 'Erro interno do servidor', 
      detalhes: 'Não foi possível atualizar o status do pedido' 
    });
  }
}

// Função auxiliar para ler arquivos JSON
function readJsonFile(filePath: string): any[] {
  try {
    if (fs.existsSync(filePath)) {
      const conteudo = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(conteudo);
    }
    return [];
  } catch (error) {
    console.error(`Erro ao ler arquivo ${filePath}:`, error);
    return [];
  }
}
