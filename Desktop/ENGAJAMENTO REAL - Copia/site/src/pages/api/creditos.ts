// Novo endpoint para estornar créditos
import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';

const CLIENTES_PATH = path.join(process.cwd(), '..', 'clientes.json');

function readClientes() {
  try {
    if (fs.existsSync(CLIENTES_PATH)) {
      const data = fs.readFileSync(CLIENTES_PATH, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Erro ao ler clientes:', error);
    return [];
  }
}

function writeClientes(clientes: any[]) {
  try {
    fs.writeFileSync(CLIENTES_PATH, JSON.stringify(clientes, null, 2));
  } catch (error) {
    console.error('Erro ao salvar clientes:', error);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { email, quantidade, motivo } = req.body;
  if (!email || typeof quantidade !== 'number' || quantidade <= 0) {
    return res.status(400).json({ error: 'Email e quantidade positiva são obrigatórios' });
  }

  let clientesUnlock: any = null;
  try {
    clientesUnlock = await lockfile.lock(CLIENTES_PATH);
    let clientes = readClientes();
    const idx = clientes.findIndex((c: any) => c.email === email);
    if (idx === -1) {
      if (clientesUnlock) await clientesUnlock();
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    clientes[idx].creditos = (clientes[idx].creditos || 0) + quantidade;
    if (!clientes[idx].historicoEstornos) clientes[idx].historicoEstornos = [];
    clientes[idx].historicoEstornos.push({
      data: new Date().toISOString(),
      quantidade,
      motivo: motivo || 'Estorno automático por falha/parcial',
    });
    writeClientes(clientes);
    if (clientesUnlock) await clientesUnlock();
    return res.status(200).json({ success: true, creditos: clientes[idx].creditos });
  } catch (error) {
    if (clientesUnlock) await clientesUnlock();
    console.error('Erro ao estornar créditos:', error);
    return res.status(500).json({ error: 'Erro ao estornar créditos', detalhes: error.message });
  }
}
