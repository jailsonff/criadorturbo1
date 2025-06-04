import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  min-height: 100vh;
  background: #111;
  color: #FFD600;
  padding: 2rem 1rem;
`;
const Title = styled.h2`
  color: #FFD600;
  margin-bottom: 2rem;
`;
const OrderTable = styled.table`
  width: 100%;
  background: #181818;
  color: #FFD600;
  border-radius: 8px;
  margin-top: 1rem;
  box-shadow: 0 2px 8px #0005;
  th, td {
    padding: 0.7rem 0.5rem;
    text-align: left;
  }
  th {
    background: #222;
  }
`;
import UserMenu from '../components/UserMenu';
export default function Pedido() {
  const [ordens, setOrdens] = React.useState<any[]>([]);
  const [editIdx, setEditIdx] = React.useState<number|null>(null);
  const [editData, setEditData] = React.useState<any>({link:'', enviados:0});

  

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const usuarioLogado = JSON.parse(localStorage.getItem('usuario_logado') || 'null');
      const pedidos = JSON.parse(localStorage.getItem('admin_pedidos') || '[]');
      if (usuarioLogado && usuarioLogado.nome) {
        setOrdens(pedidos.filter((p:any) => p.cliente === usuarioLogado.nome));
      } else {
        setOrdens([]);
      }
    }
  }, []);
  return (
    <>
      <UserMenu active="pedido" />
      <Container>
        <Title>Histórico de Pedidos</Title>
        <OrderTable>
          <thead>
            <tr>
              <th>Link</th>
              <th>Qtd. Comentários</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ordens.map((o, i) => (
              <tr key={i}>
                <td><a href={o.link} target="_blank" rel="noopener noreferrer" style={{color:'#FFD600'}}>Ver Post</a></td>
                <td>{Array.isArray(o.comentarios) ? o.comentarios.length : (o.enviados || 0)}</td>
                <td>{o.status === 'concluido' ? 'Concluído' : (o.status === 'parado' ? 'Parado' : 'Em processamento')}</td>
              </tr>
            ))}
          </tbody>
        </OrderTable>
      </Container>
    </>);
}
