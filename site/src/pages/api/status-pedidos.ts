import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// Caminhos para os arquivos de pedidos
const PEDIDOS_PENDENTES_PATH = path.join(process.cwd(), '..', 'pedidos_pendentes.json');
const PEDIDOS_PROCESSADOS_PATH = path.join(process.cwd(), '..', 'pedidos_processados.json');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Obter os pedidos pendentes e processados
    const pedidosPendentes = getPedidos(PEDIDOS_PENDENTES_PATH);
    let pedidosProcessados = getPedidos(PEDIDOS_PROCESSADOS_PATH);
    
    // Garantir que todos os pedidos processados com sucesso tenham status="concluido"
    pedidosProcessados = pedidosProcessados.map(pedido => {
      // Verificação mais abrangente para qualquer pedido processado com sucesso
      if (pedido.success === true || 
          pedido.mensagem?.includes('sucesso') || 
          pedido.message?.includes('sucesso') || 
          pedido.status === 'concluido' ||
          // Verificar se a mensagem indica que todos os comentários foram processados
          pedido.mensagem?.includes('Todos os') && pedido.mensagem?.includes('comentários foram postados') ||
          pedido.message?.includes('Todos os') && pedido.message?.includes('comentários foram postados')) {
        
        console.log(`API: Marcando pedido ${pedido.id || pedido.link} como concluído baseado na mensagem: ${pedido.mensagem || pedido.message || 'sem mensagem'}`);
        return { ...pedido, status: 'concluido', success: true };
      }
      
      // Atribuir concluído mesmo sem informação explícita de sucesso, se não for marcado como falha
      if (!pedido.status || pedido.status === 'processando' || pedido.status === 'em processamento') {
        console.log(`API: Marcando pedido ${pedido.id || pedido.link} como concluído (status anterior: ${pedido.status || 'indefinido'})`);
        return { ...pedido, status: 'concluido', success: true };
      }
      
      // Para pedidos explicitamente marcados como falha
      if (pedido.success === false || pedido.status === 'falha') {
        return { ...pedido, status: 'falha' };
      }
      
      return pedido;
    });
    
    // Combinar os resultados
    const resultado = {
      pendentes: pedidosPendentes,
      processados: pedidosProcessados
    };

    return res.status(200).json(resultado);
  } catch (error) {
    console.error('Erro ao buscar status dos pedidos:', error);
    return res.status(500).json({ 
      error: 'Erro interno do servidor', 
      detalhes: 'Não foi possível buscar o status dos pedidos' 
    });
  }
}

// Função auxiliar para ler os pedidos
function getPedidos(filePath: string): any[] {
  try {
    if (fs.existsSync(filePath)) {
      const conteudo = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(conteudo);
    }
    return [];
  } catch (error) {
    console.error(`Erro ao ler arquivo ${filePath}:`, error);
    return [];
  }
}
