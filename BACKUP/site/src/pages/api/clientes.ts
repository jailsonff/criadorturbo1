import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// Caminho para o arquivo centralizado de clientes
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

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Listar todos os clientes
    const clientes = readClientes();
    return res.status(200).json({ clientes });
  }

  if (req.method === 'POST') {
    // Cadastrar novo cliente
    const { nome, email, whatsapp, senha } = req.body;
    if (!nome || !email || !whatsapp || !senha) {
      return res.status(400).json({ error: 'Dados obrigatórios ausentes.' });
    }
    let clientes = readClientes();
    if (clientes.find((c: any) => c.email === email)) {
      return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' });
    }
    const novoCliente = { nome, email, whatsapp, senha, comentarios: 0, status: 'ativo', dataCadastro: new Date().toISOString() };
    clientes.push(novoCliente);
    writeClientes(clientes);
    return res.status(201).json({ success: true, cliente: novoCliente });
  }

  if (req.method === 'PUT') {
    // Atualizar cliente existente
    const { email, ...updates } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório para atualização.' });
    }
    let clientes = readClientes();
    const idx = clientes.findIndex((c: any) => c.email === email);
    if (idx === -1) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    clientes[idx] = { ...clientes[idx], ...updates };
    writeClientes(clientes);
    return res.status(200).json({ success: true, cliente: clientes[idx] });
  }

  if (req.method === 'DELETE') {
    // Excluir cliente existente
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório para exclusão.' });
    }
    let clientes = readClientes();
    const idx = clientes.findIndex((c: any) => c.email === email);
    if (idx === -1) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    clientes.splice(idx, 1);
    writeClientes(clientes);
    return res.status(200).json({ success: true });
  }
  return res.status(405).json({ error: 'Método não permitido.' });
}

