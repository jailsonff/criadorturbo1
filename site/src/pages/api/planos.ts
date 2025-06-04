import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

const PLANOS_PATH = path.join(process.cwd(), 'data', 'planos.json');
console.log('[planos.ts] Usando arquivo de planos:', PLANOS_PATH);

function readPlanos() {
  try {
    if (fs.existsSync(PLANOS_PATH)) {
      // Ler o arquivo diretamente, sem cache
      const data = fs.readFileSync(PLANOS_PATH, 'utf8');
      console.log('[API] Lendo planos diretamente do arquivo:', PLANOS_PATH);
      return JSON.parse(data);
    }
    console.log('[API] Arquivo de planos não encontrado, retornando array vazio');
    return [];
  } catch (error) {
    console.error('[API] Erro ao ler planos:', error);
    return [];
  }
}

function writePlanos(planos: any[]) {
  try {
    console.log('Conteúdo a ser salvo em planos.json:', planos);
    fs.writeFileSync(PLANOS_PATH, JSON.stringify(planos, null, 2));
    console.log('Arquivo planos.json salvo com sucesso.');
  } catch (error) {
    console.error('Erro ao salvar planos:', error);
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Ler os planos diretamente do arquivo a cada solicitação
    const planos = readPlanos();
    console.log('[API] Enviando planos:', planos);
    
    // Configurar headers para evitar cache
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    // Retornar apenas os planos, sem scripts ou código adicional
    return res.status(200).json({ planos });
  }

  if (req.method === 'POST') {
    console.log('Recebido POST em /api/planos');
    let body = req.body;
    console.log('Body recebido:', body);
    // Se o body vier como string, faz o parse
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
        console.log('Body convertido para objeto:', body);
      } catch (e) {
        console.error('Body não é JSON válido:', req.body);
        return res.status(400).json({ error: 'Body inválido' });
      }
    }
    const { nome, quantidade, preco, descricao } = body;
    if (!nome || !quantidade || !preco) {
      console.error('Dados obrigatórios ausentes:', body);
      return res.status(400).json({ error: 'Dados obrigatórios ausentes.' });
    }
    let planos = readPlanos();
    const novoPlano = { id: Date.now().toString(), nome, quantidade, preco, descricao };
    planos.push(novoPlano);
    try {
      writePlanos(planos);
      console.log('[planos.ts] Plano salvo com sucesso:', novoPlano);
      console.log('[planos.ts] Conteúdo atual do arquivo:', JSON.stringify(planos, null, 2));
    } catch (e) {
      console.error('Erro ao salvar plano:', e);
      return res.status(500).json({ error: 'Erro ao salvar plano.' });
    }
    return res.status(201).json({ 
      success: true, 
      plano: novoPlano,
      syncScript: `
        // Script para sincronizar planos com localStorage
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('admin_planos', '${JSON.stringify(planos).replace(/'/g, "\\'")}')
            console.log('[API] Planos sincronizados com localStorage após adicionar novo plano');
          } catch (e) {
            console.error('[API] Erro ao sincronizar planos com localStorage:', e);
          }
        }
      `
    });
  }

  if (req.method === 'PUT') {
    const { id, nome, quantidade, preco, descricao } = req.body;
    if (!id) return res.status(400).json({ error: 'ID do plano ausente.' });
    let planos = readPlanos();
    const idx = planos.findIndex((p: any) => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Plano não encontrado.' });
    planos[idx] = { ...planos[idx], nome, quantidade, preco, descricao };
    writePlanos(planos);
    return res.status(200).json({ success: true, plano: planos[idx] });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID do plano ausente.' });
    let planos = readPlanos();
    planos = planos.filter((p: any) => p.id !== id);
    writePlanos(planos);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Método não permitido.' });
}
