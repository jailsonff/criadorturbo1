import React, { useEffect, useState } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  min-height: 100vh;
  background: #181A1B;
  color: #FFF;
  padding: 2rem 1rem;
  text-align: center;
`;
const Title = styled.h2`
  color: #FFD600;
  margin-bottom: 2rem;
`;
const PlansGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  justify-content: center;
`;
const Plan = styled.div`
  background: #232528;
  border-radius: 12px;
  padding: 2rem 2.5rem;
  box-shadow: 0 2px 12px #0007;
  min-width: 220px;
  max-width: 280px;
  color: #FFF;
  display: flex;
  flex-direction: column;
  align-items: center;
`;
const Price = styled.div`
  font-size: 2.2rem;
  font-weight: bold;
  margin: 1.2rem 0 0.5rem 0;
`;
const Button = styled.button`
  padding: 0.6rem 1.6rem;
  background: #FFD600;
  color: #181A1B;
  border: none;
  border-radius: 6px;
  font-size: 1.1rem;
  font-weight: bold;
  margin-left: 1.2rem;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  &:hover {
    background: #FFF;
    color: #FFD600;
    border: 1.5px solid #FFD600;
  }
`;

const LinhaPlano = styled.div`
  background: #232528;
  color: #FFF;
  border-radius: 8px;
  box-shadow: 0 2px 8px #0005;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 320px;
  padding: 1.1rem 1.7rem;
  font-size: 1.16rem;
`;

const PlanoNome = styled.span`
  white-space: nowrap;
`;
import UserMenu from '../components/UserMenu';

export default function Planos() {
  const [modal, setModal] = useState<{valor:number, descricao:string}|null>(null);
  const [qr, setQr] = useState<{qr_code_base64:string, qr_code:string}|null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [planos, setPlanos] = useState<any[]>([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [pixPaid, setPixPaid] = useState(false);

  async function abrirPix(valor:number, descricao:string) {
    setModal({valor, descricao});
    setLoading(true);
    setErro('');
    setQr(null);
    try {
      const resp = await fetch('/api/pix', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({valor, descricao})
      });
      const data = await resp.json();
      if(data.qr_code_base64 && data.qr_code) {
        setQr({qr_code_base64: data.qr_code_base64, qr_code: data.qr_code});
        // Polling automático para checar status do pagamento Pix
        let pollingInterval: NodeJS.Timeout;
        const checkPixStatus = async () => {
          try {
            // Log para depuração
            console.log('Verificando status do Pix com txid:', data.txid, 'payment_id:', data.payment_id);
            
            // Usar o payment_id se txid for undefined
            const idToCheck = data.txid || data.payment_id;
            if (!idToCheck) {
              console.error('Erro: Nenhum ID disponível para verificar status (txid e payment_id são undefined)');
              return;
            }
            
            const statusResp = await fetch(`/api/pix-status?txid=${idToCheck}`);
            const statusData = await statusResp.json();
            console.log('Status recebido:', statusData);
            
            if (statusData.status === 'approved' || statusData.status === 'pago' || statusData.status === 'concluido') {
              // Limpar o intervalo primeiro para evitar chamadas duplicadas
              clearInterval(pollingInterval);
              
              // Descobrir qual plano foi comprado
              const planoComprado = planos.find(p => Number(p.preco) === Number(valor) && (p.descricao === descricao || p.nome === descricao));
              const qtd = planoComprado ? planoComprado.quantidade : null;
              
              if (qtd) {
                console.log('Plano comprado:', planoComprado, 'Quantidade:', qtd);
                
                // Obter o usuário logado
                const usuarioLogado = JSON.parse(localStorage.getItem('usuario_logado') || 'null');
                console.log('Usuário logado antes da atualização:', usuarioLogado);
                
                if (usuarioLogado) {
                  // Atualizar o usuário logado primeiro
                  usuarioLogado.comentarios = (usuarioLogado.comentarios || 0) + qtd;
                  localStorage.setItem('usuario_logado', JSON.stringify(usuarioLogado));
                  console.log('Saldo atualizado para usuário logado:', usuarioLogado.comentarios);

                  // Atualizar saldo no backend
                  fetch('/api/clientes', {
                    method: 'PUT',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({
                      email: usuarioLogado.email,
                      comentarios: usuarioLogado.comentarios
                    })
                  })
                  .then(res => res.json())
                  .then(data => {
                    if (!data.success) {
                      console.error('Erro ao atualizar saldo no backend:', data);
                    }
                  });
                  
                  // Atualizar na lista de clientes (usando o email como identificador)
                  const clientes = JSON.parse(localStorage.getItem('admin_clientes') || '[]');
                  const idx = clientes.findIndex((c:any) => c.email === usuarioLogado.email);
                  if (idx !== -1) {
                    clientes[idx].comentarios = (clientes[idx].comentarios || 0) + qtd;
                    localStorage.setItem('admin_clientes', JSON.stringify(clientes));
                    console.log('Cliente atualizado no admin_clientes:', clientes[idx]);
                  } else {
                    console.warn('Usuário logado não encontrado na lista de clientes!');
                  }
                  
                  // Registrar compra do pacote no admin_pacotes
                  const pacotes = JSON.parse(localStorage.getItem('admin_pacotes') || '[]');
                  pacotes.push({
                    cliente: usuarioLogado.nome || usuarioLogado.email || 'Cliente',
                    pacote: planoComprado?.descricao || planoComprado?.nome || descricao,
                    quantidade: qtd,
                    valor: Number(valor),
                    data: new Date().toLocaleString(),
                    status: 'liberado'
                  });
                  localStorage.setItem('admin_pacotes', JSON.stringify(pacotes));
                  
                  // Atualizar interface e notificar o usuário
                  setSuccessMsg(`Parabéns! Você recebeu +${qtd} comentários no seu saldo.`);
                  setPixPaid(true);
                  setQr(null); // esconde o QR code
                  
                  // Notificar o usuário e redirecionar
                  alert('Saldo atualizado! Você recebeu +' + qtd + ' comentários!');
                  
                  // Delay para mostrar a mensagem antes de redirecionar
                  setTimeout(() => {
                    setModal(null);
                    window.location.href = '/dashboard'; // Redirecionar para o dashboard
                  }, 2000);
                } else {
                  console.error('Erro: Nenhum usuário logado encontrado!');
                  alert('Erro ao atualizar saldo: usuário não encontrado!');
                }
              } else {
                console.error('Erro: Plano não encontrado ou quantidade inválida');
              }
            }
          } catch (e) {
            console.error('Erro ao verificar status do pagamento:', e);
            // Pode ignorar erros de polling - continuará tentando
          }
        };
        
        // Iniciar o polling
        pollingInterval = setInterval(checkPixStatus, 4000);
        // Executar imediatamente a primeira verificação
        checkPixStatus();
      } else {
        setErro(data.error ? `${data.error}${data.detalhes ? ' - ' + (data.detalhes.message || JSON.stringify(data.detalhes)) : ''}` : 'Erro ao gerar Pix. Tente novamente.');
      }
    } catch {
      setErro('Erro ao conectar ao MercadoPago.');
    }
    setLoading(false);
  }

  // Função para buscar planos diretamente do servidor
  async function fetchPlanosFromServer() {
    try {
      console.log('[PLANOS] Buscando planos diretamente do servidor...');
      // Adicionar timestamp para evitar cache
      const timestamp = Date.now();
      const resp = await fetch(`/api/planos?nocache=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (!resp.ok) {
        throw new Error(`Erro ao buscar planos: ${resp.status}`);
      }
      
      const data = await resp.json();
      
      if (data.planos && Array.isArray(data.planos)) {
        console.log('[PLANOS] Planos recebidos do servidor:', data.planos);
        setPlanos(data.planos);
      } else {
        console.error('[PLANOS] Dados de planos inválidos:', data);
        setPlanos([]);
      }
    } catch (err) {
      console.error('[PLANOS] Erro ao buscar planos do servidor:', err);
      setPlanos([]);
    }
  }

  // Efeito para carregar planos ao iniciar e periodicamente
  useEffect(() => {
    // Carregar planos imediatamente ao montar o componente
    fetchPlanosFromServer();
    
    // Configurar intervalo para recarregar a cada 5 segundos
    const intervalId = setInterval(() => {
      console.log('[PLANOS] Verificando atualizações de planos...');
      fetchPlanosFromServer();
    }, 5000); // Verificar a cada 5 segundos
    
    // Configurar listener para quando a aba receber foco
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('[PLANOS] Aba recebeu foco, atualizando planos...');
        fetchPlanosFromServer();
      }
    };
    
    // Adicionar event listeners
    document.addEventListener('visibilitychange', onVisibility);
    
    // Limpar event listeners e intervalo ao desmontar
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  console.log('Planos em estado:', planos);
  return (
    <>
      <UserMenu active="planos" />
      <Container>
        <Title>Pacotes de Comentários</Title>

        <div style={{display:'flex', flexDirection:'column', gap:'1.2rem', alignItems:'center', marginTop:'2rem'}}>
          {planos.length === 0 && (
            <div style={{color:'#FFD600',margin:'1rem 0'}}>Nenhum plano disponível no momento.</div>
          )}
          {planos.map((plano:any, i:number) => (
            <LinhaPlano key={i}>
              <PlanoNome>
                {plano.descricao && plano.descricao.trim() !== ''
                  ? plano.descricao
                  : (<><b>{plano.nome}</b> <span style={{color:'#FFD600'}}>({plano.quantidade} comentários)</span></>)}
              </PlanoNome>
              <span style={{color:'#FFD600',fontWeight:'bold',marginLeft:12,fontSize:'1.09rem'}}>R${Number(plano.preco).toFixed(2).replace('.', ',')}</span>
              <Button onClick={()=>abrirPix(Number(plano.preco), plano.descricao && plano.descricao.trim() !== '' ? plano.descricao : `Plano: ${plano.nome} - ${plano.quantidade} comentários`)} style={{marginLeft:12}}>COMPRAR</Button>
            </LinhaPlano>
          ))}
        </div>
        <div style={{marginTop:32, color:'#FFD600', fontSize:'1rem'}}>
          Após o pagamento via Pix, os comentários ficam disponíveis na sua conta e podem ser usados quando quiser!
        </div>
      </Container>
      {successMsg && (
        <div style={{background:'#FFD600',color:'#181A1B',fontWeight:'bold',borderRadius:8,padding:'1.1rem 1.7rem',margin:'2rem auto',maxWidth:380,textAlign:'center',boxShadow:'0 2px 8px #0005',fontSize:'1.13rem'}}>{successMsg}</div>
      )}
      {modal && (
        <ModalOverlay>
          <ModalBox>
            <button onClick={()=>setModal(null)} style={{position:'absolute',top:10,right:18,background:'none',border:'none',color:'#FFD600',fontSize:26,cursor:'pointer'}}>×</button>
            <h3 style={{color:'#FFD600',marginBottom:12}}>Pagamento via Pix</h3>
            <div style={{color:'#FFD600',marginBottom:10}}>{modal.descricao} - <b>R${modal.valor.toFixed(2)}</b></div>
            {loading && <div style={{color:'#FFD600'}}>Gerando QR Code...</div>}
            {erro && <div style={{color:'#FFD600',background:'#222',padding:8,borderRadius:6,marginBottom:10}}>{erro}</div>}
            {qr && !pixPaid && (
              <>
                <img src={`data:image/png;base64,${qr.qr_code_base64}`} alt="QR Pix" style={{margin:'10px auto',display:'block',maxWidth:220}} />
                <div style={{wordBreak:'break-all',background:'#222',color:'#FFD600',padding:8,borderRadius:6,marginTop:10,fontSize:'0.98rem'}}>{qr.qr_code}</div>
                <button style={{margin:'14px auto 0 auto',display:'block',background:'#FFD600',color:'#111',border:'none',borderRadius:6,padding:'0.6rem 1.2rem',fontWeight:'bold',fontSize:'1rem',cursor:'pointer'}} onClick={()=>{navigator.clipboard.writeText(qr.qr_code)}}>Copiar código Pix</button>
              </>
            )}
            {pixPaid && (
              <div style={{color:'#00e676',background:'#222',padding:18,borderRadius:10,marginTop:18,fontWeight:'bold',fontSize:'1.18rem'}}>
                Pagamento confirmado com sucesso!<br/>Atualizando página...
              </div>
            )}
          </ModalBox>
        </ModalOverlay>
      )}
    </>
  );
}

const ModalOverlay = styled.div`
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;
const ModalBox = styled.div`
  background: #181818;
  border-radius: 12px;
  box-shadow: 0 4px 32px #000a;
  padding: 2.2rem 2rem 1.8rem 2rem;
  min-width: 320px;
  max-width: 96vw;
  min-height: 220px;
  position: relative;
  text-align: center;
`;

