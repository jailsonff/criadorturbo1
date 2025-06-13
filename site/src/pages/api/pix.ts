import type { NextApiRequest, NextApiResponse } from 'next';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { valor, descricao } = req.body;
  console.log('Dados recebidos:', { valor, descricao, typeofValor: typeof valor });
  if (!valor || isNaN(Number(valor))) {
    return res.status(400).json({ error: 'Valor inválido', recebido: valor });
  }
  if (!descricao) {
    return res.status(400).json({ error: 'Descrição ausente' });
  }

  try {
    const paymentData = {
      transaction_amount: Number(valor),
      description: String(descricao),
      payment_method_id: 'pix',
      payer: {
        email: `comprador+${Date.now()}@bot.com`,
        first_name: 'Cliente',
        last_name: 'Bot',
        identification: {
          type: 'CPF',
          number: '12345678909',
        },
      },
    };
    console.log('Objeto enviado ao MercadoPago:', paymentData);
    const payment = await new Payment(client).create({ body: paymentData });
    console.log('Resposta MercadoPago:', JSON.stringify(payment, null, 2));
    const pix = payment.point_of_interaction?.transaction_data;
    if (!pix || !pix.qr_code) {
      console.error('Pix não gerado ou resposta inesperada:', payment);
      return res.status(500).json({ error: 'Pix não gerado', detalhes: payment });
    }
    return res.status(200).json({
      qr_code: pix.qr_code,
      qr_code_base64: pix.qr_code_base64,
      payment_id: payment.id,
      status: payment.status,
    });
  } catch (error: any) {
    // Log detalhado no terminal
    console.error('MercadoPago erro:', error);
    if (error && error.response && error.response.data) {
      console.error('MercadoPago erro data:', error.response.data);
    }
    return res.status(500).json({ error: error.message || 'Erro ao gerar pagamento Pix', detalhes: error.response?.data || null });
  }
}
