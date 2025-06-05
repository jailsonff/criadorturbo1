const fs = require('fs');
const path = require('path');

const PLANOS_PATH = path.join(__dirname, 'data', 'planos.json');

function testWritePlano() {
  let planos = [];
  if (fs.existsSync(PLANOS_PATH)) {
    planos = JSON.parse(fs.readFileSync(PLANOS_PATH, 'utf8'));
  }
  const novoPlano = { id: Date.now().toString(), nome: 'Plano Teste', quantidade: 1, preco: 0.99, descricao: 'Teste automático' };
  planos.push(novoPlano);
  fs.writeFileSync(PLANOS_PATH, JSON.stringify(planos, null, 2));
  console.log('Plano gravado com sucesso!');
  console.log('Conteúdo atual:', JSON.stringify(planos, null, 2));
}

testWritePlano();
