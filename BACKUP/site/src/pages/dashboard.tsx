import React from 'react';
import styled from 'styled-components';
import { useState, useEffect } from 'react';

const Container = styled.div`
  min-height: 100vh;
  background: #181A1B;
  color: #FFF;
  padding: 2rem 1rem;
`;
const Welcome = styled.h2`
  color: #FFD600;
  margin-bottom: .5rem;
`;
const StatusBox = styled.div`
  background: #212325;
  border-radius: 12px;
  padding: 1.5rem 1.2rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 12px #0007;
  max-width: 420px;
  margin-left: auto;
  margin-right: auto;
  color: #FFF;
`;
const Stat = styled.div`
  font-size: 1.1rem;
  margin-bottom: .5rem;
  color: #FFD600;
`;
const CommentsLeft = styled.span`
  font-size: 2.3rem;
  font-weight: bold;
  color: #FFD600;
`;
const SectionTitle = styled.h3`
  color: #FFD600;
  margin-top: 2.5rem;
`;
const OrderTable = styled.table`
  width: 100%;
  background: #232528;
  color: #FFF;
  border-radius: 8px;
  margin-top: 1rem;
  box-shadow: 0 2px 8px #0005;
  th, td {
    padding: 0.7rem 0.5rem;
    text-align: left;
  }
  th {
    background: #181A1B;
    color: #FFD600;
  }
`;
const Form = styled.form`
  background: #232528;
  border-radius: 12px;
  padding: 1.5rem 1.2rem;
  margin: 2rem auto;
  max-width: 420px;
  box-shadow: 0 2px 12px #0007;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
`;
const Input = styled.input`
  width: 100%;
  padding: .8rem;
  margin-bottom: 1rem;
  border-radius: 6px;
  border: 1px solid #292B2E;
  background: #181A1B;
  color: #FFF;
  font-size: 1rem;
  transition: border 0.2s;
  &:focus {
    border: 1.5px solid #FFD600;
    outline: none;
  }
`;
const Textarea = styled.textarea`
  width: 100%;
  padding: .8rem;
  min-height: 160px;
  border-radius: 6px;
  border: 1px solid #292B2E;
  background: #181A1B;
  color: #FFF;
  font-size: 1rem;
  resize: vertical;
  transition: border 0.2s;
  &::placeholder {
    color: #E0E0E0;
    opacity: 1;
  }
  &:focus {
    border: 1.5px solid #FFD600;
    outline: none;
  }
`;
const Button = styled.button`
  width: 100%;
  padding: 1rem;
  background: #FFD600;
  color: #181A1B;
  border: none;
  border-radius: 6px;
  font-size: 1.13rem;
  font-weight: bold;
  margin-top: 0.5rem;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  &:hover {
    background: #FFF;
    color: #FFD600;
  }
`;

import UserMenu from '../components/UserMenu';

const CommentStatusBox = styled.div`
  background: #181818;
  border-radius: 8px;
  margin: 10px 0 18px 0;
  padding: 12px 18px 10px 18px;
  box-shadow: 0 2px 8px #0004;
`;
const StatusLabel = styled.div`
  color: #FFD600;
  font-weight: bold;
  font-size: 1.1rem;
  margin-bottom: 8px;
  text-align: right;
`;
const BarContainer = styled.div`
  background: #222;
  border-radius: 6px;
  width: 100%;
  height: 10px;
  margin-top: 2px;
`;
const BarFill = styled.div`
  background: linear-gradient(90deg,#FFD600,#FFC400);
  height: 100%;
  border-radius: 6px;
  transition: width 0.3s;
`;

const SuccessAlert = styled.div`
  margin: 18px auto 0 auto;
  padding: 1rem 2rem;
  background: #FFD600;
  color: #111;
  font-weight: bold;
  border-radius: 8px;
  box-shadow: 0 2px 8px #0003;
  text-align: center;
  max-width: 380px;
  font-size: 1.15rem;
`;

const AvisoLinkInvalido = styled.div`
  color: #FFD600;
  background: #222;
  border: 1.5px solid #FFD600;
  border-radius: 6px;
  padding: 0.7rem 1rem;
  margin: 0.6rem 0 0.3rem 0;
  font-size: 1rem;
  text-align: left;
  max-width: 420px;
  margin-left: auto;
  margin-right: auto;
`;

export default function Dashboard() {
  // Estados para interface e feedback
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('Pedido realizado com sucesso');
  // Dados reais do localStorage
  const [user, setUser] = useState<any>(null);
  const [comentarios, setComentarios] = useState(0);
  const [ordens, setOrdens] = useState<any[]>([]);
  const [planos, setPlanos] = useState<any[]>([]);

  // Buscar planos do backend centralizado
  async function fetchPlanos() {
    try {
      console.log('[DASHBOARD] Iniciando busca de planos...');
      const resp = await fetch('/api/planos');
      const data = await resp.json();
      
      // Executar script de sincronização se disponível
      if (data.syncScript && typeof window !== 'undefined') {
        try {
          console.log('[DASHBOARD] Executando script de sincronização');
          // eslint-disable-next-line no-eval
          eval(data.syncScript);
        } catch (e) {
          console.error('[DASHBOARD] Erro ao executar script de sincronização:', e);
        }
      }
      
      if (data.planos && data.planos.length > 0) {
        console.log('[DASHBOARD] Planos recebidos da API:', data.planos);
        setPlanos(data.planos);
      } else {
        console.log('[DASHBOARD] Nenhum plano recebido da API, verificando localStorage...');
        // Fallback para localStorage se a API não retornar planos
        if (typeof window !== 'undefined') {
          const planosStorage = JSON.parse(localStorage.getItem('admin_planos') || '[]');
          if (planosStorage.length > 0) {
            console.log('[DASHBOARD] Planos encontrados no localStorage:', planosStorage);
            setPlanos(planosStorage);
          } else {
            console.log('[DASHBOARD] Nenhum plano encontrado no localStorage');
            setPlanos([]);
          }
        }
      }
    } catch (err) {
      console.error('[DASHBOARD] Erro ao buscar planos da API:', err);
      // Fallback para localStorage em caso de erro
      if (typeof window !== 'undefined') {
        const planosStorage = JSON.parse(localStorage.getItem('admin_planos') || '[]');
        if (planosStorage.length > 0) {
          console.log('[DASHBOARD] Usando planos do localStorage após erro:', planosStorage);
          setPlanos(planosStorage);
        } else {
          console.log('[DASHBOARD] Nenhum plano encontrado no localStorage após erro');
          setPlanos([]);
        }
      } else {
        setPlanos([]);
      }
    }
  }

  React.useEffect(() => {
    fetchPlanos();
    // Opcional: atualizar a cada 30 segundos
    const interval = setInterval(fetchPlanos, 30000);
    return () => clearInterval(interval);
  }, []);
  const [link, setLink] = useState('');
  const [comentariosEnvio, setComentariosEnvio] = useState('');
  const [linkInvalido, setLinkInvalido] = useState(false);
  const [perfilPrivado, setPerfilPrivado] = useState(false);
  const [atualizandoStatus, setAtualizandoStatus] = useState(false);

  // Função para verificar status dos pedidos
  async function verificarStatusPedidos() {
    if (atualizandoStatus) return; // Evita múltiplas requisições simultâneas
    
    try {
      setAtualizandoStatus(true);
      console.log('Verificando status dos pedidos...');
      
      // Buscar status atualizado dos pedidos com timestamp para evitar cache
      const timestamp = Date.now();
      const resposta = await fetch(`/api/status-pedidos?t=${timestamp}`);
      
      if (!resposta.ok) {
        console.error('Erro ao buscar status dos pedidos');
        return;
      }
      
      const { pendentes, processados } = await resposta.json();
      console.log('Pedidos pendentes:', pendentes.length);
      console.log('Pedidos processados:', processados.length);
      
      // Se temos ordens na interface
      if (ordens.length > 0) {
        console.log('Ordens atuais na interface:', ordens);
        let algumPedidoAtualizado = false;
        const ordensAtualizadas = [...ordens];
        
        // Verificar pedidos processados explicitamente
        // Esta parte é crucial para identificar pedidos que já foram processados pelo bot
        processados.forEach((pedidoProcessado: any) => {
          // Procurar o pedido com correspondência de ID OU link
          const idx = ordensAtualizadas.findIndex((ordem: any) => {
            // Primeiro tentar encontrar por ID (mais preciso)
            if (pedidoProcessado.id && ordem.id) {
              return pedidoProcessado.id === ordem.id;
            }
            // Se não tiver ID, usar o link como fallback
            return ordem.link === pedidoProcessado.link;
          });
          
          // Se encontramos o pedido E ele está em processamento OU pendente E o processado está concluído
          if (idx !== -1 && 
              (ordensAtualizadas[idx].status === 'processando' || ordensAtualizadas[idx].status === 'pendente') && 
              pedidoProcessado.status === 'concluido') {
            
            console.log(`Pedido para ${pedidoProcessado.link} encontrado como CONCLUÍDO, atualizando status`);
            // Atualizar status na interface
            ordensAtualizadas[idx].status = 'concluido';
            algumPedidoAtualizado = true;
            
            // Mostrar mensagem de sucesso
            setSuccessMsg(`Pedido de comentários concluído para o link ${pedidoProcessado.link}`);
            setShowSuccess(true);
          }
        });
        
        // Depois verificar pedidos em processamento que não estão mais na lista de pendentes
        // Isso é uma verificação adicional para casos onde o pedido saiu da lista de pendentes
        // mas não apareceu na lista de processados
        ordensAtualizadas.forEach((ordem, idx) => {
          if (ordem.status === 'processando') {
            // Aqui apenas lógica de atualização, sem JSX
          }
        });
        
        // Apenas atualizar se houve mudanças
        if (algumPedidoAtualizado) {
          console.log('Atualizando ordens com novos status:', ordensAtualizadas);
          
          // Atualizar no localStorage
          if (typeof window !== 'undefined') {
            const pedidosStorage = JSON.parse(localStorage.getItem('admin_pedidos') || '[]');
            
            // Atualizar status no localStorage para todos os pedidos atualizados
            // Buscar por ID primeiro e depois por link para maior precisão
            ordensAtualizadas.forEach((ordem: any) => {
              const idxStorage = pedidosStorage.findIndex((p: any) => {
                if (ordem.id && p.id) {
                  return p.id === ordem.id;
                }
                return p.link === ordem.link;
              });
              
              if (idxStorage !== -1 && pedidosStorage[idxStorage].status !== ordem.status) {
                console.log(`Atualizando status no localStorage para ${ordem.id || ordem.link}: ${pedidosStorage[idxStorage].status} -> ${ordem.status}`);
                pedidosStorage[idxStorage].status = ordem.status;
              }
            });
            
            // Salvar as mudanças no localStorage
            localStorage.setItem('admin_pedidos', JSON.stringify(pedidosStorage));
          }
        }
        
        // Atualizar estado na interface
        setOrdens(ordensAtualizadas);
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
    } finally {
      setAtualizandoStatus(false);
    }
  }
  
  // Função para buscar pedidos do backend e sincronizar status para o usuário logado
  async function fetchPedidosUsuario() {
    const usuarioLogado = JSON.parse(localStorage.getItem('usuario_logado') || 'null');
    if (!usuarioLogado) {
      setOrdens([]);
      return;
    }
    try {
      const resp = await fetch('/api/status-pedidos');
      const data = await resp.json();
      // Filtrar apenas os pedidos do usuário logado
      const pedidosUsuario = [...(data.pendentes || []), ...(data.processados || [])].filter((p:any) => p.cliente === usuarioLogado.nome || p.email === usuarioLogado.email);
      setOrdens(pedidosUsuario);
      // Atualizar localStorage para manter compatibilidade com lógicas antigas
      if (typeof window !== 'undefined') {
        localStorage.setItem('admin_pedidos', JSON.stringify(pedidosUsuario));
      }
    } catch (err) {
      // fallback para localStorage
      const pedidos = JSON.parse(localStorage.getItem('admin_pedidos') || '[]');
      setOrdens(pedidos.filter((p:any) => p.cliente === usuarioLogado.nome));
    }
  }

  // Função para carregar os dados do localStorage
  async function loadUserData() {
    // Busca o usuário logado corretamente
    const usuarioLogado = JSON.parse(localStorage.getItem('usuario_logado') || 'null');
    if (!usuarioLogado) {
      setUser(null);
      setComentarios(0);
      setOrdens([]);
      setPlanos([]);
      return;
    }
    // Buscar o usuário atualizado na lista de clientes da API
    try {
      const resp = await fetch('/api/clientes');
      const data = await resp.json();
      const usuarioAtualizado = data.clientes.find((c:any) => c.email === usuarioLogado.email) || usuarioLogado;
      setUser(usuarioAtualizado);
      setComentarios(usuarioAtualizado.comentarios || 0);
    } catch (err) {
      // fallback para localStorage, se a API falhar
      const clientes = JSON.parse(localStorage.getItem('admin_clientes') || '[]');
      const usuarioAtualizado = clientes.find((c:any) => c.email === usuarioLogado.email) || usuarioLogado;
      setUser(usuarioAtualizado);
      setComentarios(usuarioAtualizado.comentarios || 0);
    }
    // Não atualizar ordens aqui, pois será feito por fetchPedidosUsuario
  }

  useEffect(() => {
    loadUserData();
    fetchPedidosUsuario(); // Buscar pedidos do backend ao abrir o dashboard

    // Verificar status inicial
    verificarStatusPedidos();
    
    // Verificar com mais frequência para manter a fila fluindo
    const intervalId = setInterval(() => {
      verificarStatusPedidos();
      fetchPedidosUsuario(); // Sincronizar com backend a cada ciclo
    }, 5000);
    
    if (typeof window !== 'undefined') {
      // Listener para sincronizar em tempo real
      const onStorage = (e: StorageEvent) => {
        if (["admin_clientes", "admin_pedidos", "admin_planos", "usuario_logado"].includes(e.key || "")) {
          loadUserData();
          fetchPedidosUsuario();
        }
      };
      window.addEventListener('storage', onStorage);
      
      // Listener para recarregar ao focar/voltar para a aba
      const onVisibility = () => {
        if (document.visibilityState === 'visible') {
          loadUserData();
          fetchPedidosUsuario();
          verificarStatusPedidos(); // Também verificar status quando a aba receber foco
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      
      // Limpar todos os event listeners e intervalos quando o componente for desmontado
      return () => {
        clearInterval(intervalId);
        window.removeEventListener('storage', onStorage);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    } else {
      // Se window não estiver definido, apenas limpar o intervalo
      return () => clearInterval(intervalId);
    }
  }, []);

  if (user === null) {
    // Nenhum usuário encontrado
    return (
      <div style={{color:'#FFD600',textAlign:'center',marginTop:'3rem'}}>
        Nenhum usuário encontrado.<br/>
        <a href="/login" style={{color:'#FFD600',textDecoration:'underline'}}>Clique aqui para fazer login ou cadastrar-se</a>.
      </div>
    );
  }

  // Função renderPlanos removida - os planos agora são exibidos apenas na página de planos
  function isInstagramPostLink(url: string) {
    // Aceita posts, reels, tv e vídeo do Instagram
    const regex = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[\w\-]+/i;
    return regex.test(url.trim());
  }

  async function enviarComentarios(e: any) {
    e.preventDefault();
    if (!isInstagramPostLink(link)) {
      setLinkInvalido(true);
      return;
    }
    setLinkInvalido(false);
    
    // Obter lista de comentários
    const linhas = comentariosEnvio.split('\n').filter(Boolean);
    if (linhas.length > comentarios) {
      alert('Você não tem comentários suficientes. Compre um novo pacote!');
      return;
    }
    
    // Criar o pedido
    const novoSaldo = comentarios - linhas.length;
    const novaOrdem = { 
      link, 
      enviados: linhas.length, 
      status: 'processando', 
      cliente: user?.nome,
      email: user?.email, 
      data: new Date().toLocaleString() 
    };
    
    try {
      // Enviar para a API de comentários
      setShowSuccess(true); // Mostrar mensagem de "processando"
      
      // Enviar pedido para o bot
      const resposta = await fetch('/api/comentarios', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          link,
          comentarios: linhas,
          cliente: user?.nome,
          email: user?.email
        })
      });
      
      const resultado = await resposta.json();
      
      if (!resposta.ok) {
        throw new Error(resultado.error || 'Erro ao enviar comentários');
      }
      
      console.log('Comentários enviados para processamento:', resultado);
      
      // Atualizar saldo no localStorage (usuario_logado e admin_clientes)
      if (typeof window !== 'undefined' && user) {
        // Atualiza usuario_logado
        const usuarioLogado = { ...user, comentarios: novoSaldo };
        localStorage.setItem('usuario_logado', JSON.stringify(usuarioLogado));
        // Atualiza na lista de clientes
        const clientes = JSON.parse(localStorage.getItem('admin_clientes') || '[]');
        const idx = clientes.findIndex((c:any) => c.email === user.email);
        if (idx !== -1) {
          clientes[idx].comentarios = novoSaldo;
          localStorage.setItem('admin_clientes', JSON.stringify(clientes));
        }
      }
      
      // Atualizar interface
      setComentarios(novoSaldo);
      const novasOrdens = [...ordens, novaOrdem];
      setOrdens(novasOrdens);
      
      // Salvar o pedido com seu ID para referência futura
      const pedidoComId = {
        ...novaOrdem,
        pedido_id: resultado.pedido_id
      };
      
      // Atualiza no localStorage para persistir o status
      if (typeof window !== 'undefined') {
        const pedidos = JSON.parse(localStorage.getItem('admin_pedidos') || '[]');
        pedidos.push(pedidoComId);
        localStorage.setItem('admin_pedidos', JSON.stringify(pedidos));
      }
      
      // Configurar uma verificação imediata do status após alguns segundos
      setTimeout(() => {
        verificarStatusPedidos();
      }, 2000);
      
      // Configurar verificações adicionais em intervalos mais frequentes por um curto período
      const checkInterval = setInterval(() => {
        verificarStatusPedidos();
      }, 5000); // Verificar a cada 5 segundos
      
      // Limpar o intervalo após 2 minutos (quando provavelmente já terá sido processado)
      setTimeout(() => {
        clearInterval(checkInterval);
      }, 120000);
      
      // Limpar campos
      setLink('');
      setComentariosEnvio('');
      
      // Mostrar mensagem de sucesso
      setSuccessMsg('Comentários enviados com sucesso! O bot está processando seu pedido.');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (error: any) {
      console.error('Erro ao enviar comentários:', error);
      alert(`Erro ao enviar comentários: ${error.message}`);
      setShowSuccess(false);
    }
  }
  return (
    <>
      <UserMenu active="dashboard" />
      <Container>
        <div style={{display:'flex',justifyContent:'flex-end',maxWidth:700,margin:'0 auto 1.5rem auto'}}>
          <button
            onClick={() => {
              localStorage.removeItem('usuario_logado');
              window.location.href = '/login';
            }}
            style={{background:'#F44336',color:'#FFF',border:'none',borderRadius:6,padding:'0.5rem 1.3rem',fontWeight:'bold',fontSize:'1rem',cursor:'pointer',boxShadow:'0 2px 8px #0003'}}
          >Desconectar</button>
        </div>
        <Welcome>Olá, {user.nome}, bem-vindo!</Welcome>
        <StatusBox>
          <Stat>Status: <b style={{color:'#FFD600'}}>Conectado</b></Stat>
          <Stat>Você tem <CommentsLeft>{comentarios}</CommentsLeft> comentários disponíveis.</Stat>
        </StatusBox>
        
        <Form onSubmit={enviarComentarios}>
          <SectionTitle>Enviar Comentários</SectionTitle>
          <Input placeholder="Cole o link do post" value={link} onChange={async e=> {
            const val = e.target.value;
            setLink(val);
            setLinkInvalido(false);
            setPerfilPrivado(false);
            // Verificação automática se o perfil é privado
            if (/^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\//i.test(val.trim())) {
              try {
                const resp = await fetch(val, { mode: 'cors' });
                const html = await resp.text();
                if (html.includes('Esta publicação é de uma conta privada') || html.includes('This post is from a private account') || html.includes('Esta Página Não Está Disponível') || html.includes('This page isn\'t available')) {
                  setPerfilPrivado(true);
                } else {
                  setPerfilPrivado(false);
                }
              } catch (err) {
                setPerfilPrivado(false); // Não conseguiu verificar
              }
            }
          }} required />
          {linkInvalido && (
            <AvisoLinkInvalido>
              Link inválido! Insira um link de post, reel ou IGTV do Instagram.
            </AvisoLinkInvalido>
          )}
          {perfilPrivado && (
            <AvisoLinkInvalido style={{borderColor:'#F44336',color:'#F44336'}}>
              NÃO FUNCIONA EM PERFIL PRIVADO
            </AvisoLinkInvalido>
          )}
          <Textarea placeholder="Digite os comentários, um por linha" value={comentariosEnvio} onChange={e=>setComentariosEnvio(e.target.value)} required />
          {/* Visualização dos comentários numerados */}
          {comentariosEnvio.trim() && (
            <CommentStatusBox>
              <StatusLabel>Pré-visualização dos comentários:</StatusLabel>
              <ul style={{margin:0, paddingLeft:18, color:'#FFF', fontSize:'1rem'}}>
                {comentariosEnvio.split('\n').filter(Boolean).map((coment, idx) => (
                  <li key={idx} style={{marginBottom:2}}>
                    <span style={{color:'#FFD600', fontWeight:'bold'}}>{idx+1}.</span> {coment}
                  </li>
                ))}
              </ul>
            </CommentStatusBox>
          )}
          <CommentStatusBox>
            <StatusLabel>
              {comentariosEnvio.split('\n').filter(Boolean).length} comentário(s) digitado(s)
            </StatusLabel>
            <BarContainer>
              <BarFill style={{width: `${Math.min(comentariosEnvio.split('\n').filter(Boolean).length, 20)*5}%`}} />
            </BarContainer>
          </CommentStatusBox>
          <Button type="submit">Enviar Comentários</Button>
          <div style={{marginTop:12, color:'#FFD600', textAlign:'center', fontWeight:600, fontSize:'1.05rem', letterSpacing:0.5}}>
            NÃO FUNCIONA EM PERFIL PRIVADO
          </div>
        </Form>
        {showSuccess && (
          <SuccessAlert>
            {successMsg}
          </SuccessAlert>
        )}
      </Container>
    </>
  );
}
