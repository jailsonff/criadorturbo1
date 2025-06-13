import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

const PEDIDOS_PENDENTES_PATH = path.join(process.cwd(), '..', 'pedidos_pendentes.json');
const PEDIDOS_PROCESSADOS_PATH = path.join(process.cwd(), '..', 'pedidos_processados.json');

function readPedidos(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Erro ao ler pedidos:', error);
    return [];
  }
}

function writePedidos(filePath: string, pedidos: any[]) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(pedidos, null, 2));
  } catch (error) {
    console.error('Erro ao salvar pedidos:', error);
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'DELETE') {
    // Excluir pedido por id ou link, e especificar se é pendente ou processado
    const { id, link, tipo } = req.body;
    if (!id && !link) {
      return res.status(400).json({ error: 'ID ou link do pedido é obrigatório.' });
    }
    if (!tipo || !['pendente', 'processado'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo deve ser "pendente" ou "processado".' });
    }
    const filePath = tipo === 'pendente' ? PEDIDOS_PENDENTES_PATH : PEDIDOS_PROCESSADOS_PATH;
    let pedidos = readPedidos(filePath);
    const idx = pedidos.findIndex((p: any) => (id && p.id === id) || (link && p.link === link));
    if (idx === -1) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    pedidos.splice(idx, 1);
    writePedidos(filePath, pedidos);
    return res.status(200).json({ success: true });
  }

  if (req.method === 'PUT') {
    // Editar pedido por id ou link, e especificar se é pendente ou processado
    const { id, link, tipo, ...updates } = req.body;
    if (!id && !link) {
      return res.status(400).json({ error: 'ID ou link do pedido é obrigatório.' });
    }
    if (!tipo || !['pendente', 'processado'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo deve ser "pendente" ou "processado".' });
    }
    const filePath = tipo === 'pendente' ? PEDIDOS_PENDENTES_PATH : PEDIDOS_PROCESSADOS_PATH;
    let pedidos = readPedidos(filePath);
    const idx = pedidos.findIndex((p: any) => (id && p.id === id) || (link && p.link === link));
    if (idx === -1) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    pedidos[idx] = { ...pedidos[idx], ...updates };
    writePedidos(filePath, pedidos);
    return res.status(200).json({ success: true, pedido: pedidos[idx] });
  }

  return res.status(405).json({ error: 'Método não permitido.' });
}
