import type { NextApiRequest, NextApiResponse } from 'next';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { txid } = req.query;
  
  if (!txid || typeof txid !== 'string') {
    return res.status(400).json({ error: 'txid é obrigatório' });
  }

  console.log(`Verificando status do pagamento ${txid}`);
  
  try {
    // Consulta o status do pagamento no MercadoPago
    const payment = await new Payment(client).get({ id: txid });
    console.log(`Status do pagamento ${txid}: ${payment.status}`);
    
    return res.status(200).json({
      status: payment.status,
      payment_id: payment.id,
      txid: payment.id
    });
  } catch (error: any) {
    console.error('Erro ao verificar status do pix:', error);
    
    return res.status(500).json({ 
      error: error.message || 'Erro ao verificar status do pagamento', 
      status: 'error'
    });
  }
}
