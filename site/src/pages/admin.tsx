import React, { useState, useEffect } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  min-height: 100vh;
  background: #181A1B;
  color: #FFF;
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100vw;
`;
const Title = styled.h2`
  color: #FFD600;
  margin-bottom: 2rem;
  text-align: center;
`;
const Section = styled.div`
  background: #232528;
  border-radius: 12px;
  padding: 1.5rem 1.2rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 12px #0007;
  max-width: 900px;
  margin-left: auto;
  margin-right: auto;
  color: #FFF;
  display: flex;
  flex-direction: column;
  align-items: center;
`;
const Table = styled.table`
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  background: #232528;
  color: #FFF;
  border-radius: 8px;
  margin-top: 1rem;
  box-shadow: 0 2px 8px #0005;
  th, td {
    padding: 0.7rem 0.5rem;
    text-align: center;
    vertical-align: middle;
  }
  th {
    background: #181A1B;
    color: #FFD600;
    font-weight: bold;
    text-align: center;
  }
`;
const Button = styled.button`
  padding: 0.5rem 1.2rem;
  background: #FFD600;
  color: #181A1B;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: bold;
  margin-right: 0.5rem;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  &:hover {
    background: #FFF;
    color: #FFD600;
    border: 1.5px solid #FFD600;
  }
`;

import AdminMenu from '../components/AdminMenu';

// Interfaces para tipagem
interface Plano {
  nome: string;
  quantidade: number;
  preco: number;
  descricao?: string;
  id?: string;
}

// Planos agora são buscados da API
// const planosMock: Plano[] = [ ... ];

const CLIENTES_KEY = 'admin_clientes';
const PEDIDOS_KEY = 'admin_pedidos';
const PACOTES_KEY = 'admin_pacotes';
const PLANOS_KEY = 'admin_planos';

const mockClientes = [
  { nome: 'João', email: 'joao@email.com', whatsapp: '11999999999', senha: 'senha123', status: 'ativo', comentarios: 20, admin: true, simultaneos: 1 },
  { nome: 'Maria', email: 'maria@email.com', whatsapp: '11888888888', senha: 'senha456', status: 'bloqueado', comentarios: 10, admin: false, simultaneos: 1 },
];
// Incluindo status na interface de pedidos
interface Pedido {
  id?: string;
  cliente: string;
  link: string;
  enviados: number;
  status?: string;
  comentarios?: string[];
  data_criacao?: string;
  data_processamento?: string;
  visualId?: number; // ID sequencial para exibição
}

const mockPedidos: Pedido[] = [
  { cliente: 'Ricardo', link: 'https://instagram.com/p/abc123', enviados: 30, status: 'concluido' },
  { cliente: 'Maria', link: 'https://instagram.com/p/xyz789', enviados: 10, status: 'processando' }
];
const mockPacotes = [
  { cliente: 'Ricardo', pacote: '100', status: 'liberado' },
  { cliente: 'Maria', pacote: '50', status: 'aguardando' }
];

export default function Admin() {
  async function handleDeleteUser(idx:number) {
    if(window.confirm('Tem certeza que deseja excluir este usuário?')){
      const email = clientes[idx].email;
      try {
        const resp = await fetch('/api/clientes', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
          await fetchClientes();
          setMsg('Usuário excluído!');
          setTimeout(()=>setMsg(''), 1500);
        } else {
          setMsg(data.error || 'Erro ao excluir usuário!');
          setTimeout(()=>setMsg(''), 2500);
        }
      } catch (err) {
        setMsg('Erro ao excluir usuário!');
        setTimeout(()=>setMsg(''), 2500);
      }
    }
  }
  // MOCK: clientes, pedidos e pacotes
  const [clientes, setClientes] = useState(mockClientes);
  const [pedidos, setPedidos] = useState(mockPedidos);
  const [pacotes, setPacotes] = useState(mockPacotes);

  // Função global para atualizar pedidos do backend
  async function fetchPedidosAdmin() {
    try {
      const resp = await fetch('/api/status-pedidos');
      const data = await resp.json();
      // Juntar todos os pedidos (pendentes + processados) vindos da API
      const todosPedidos = [...(data.pendentes || []), ...(data.processados || [])];
      // Filtrar duplicados por id (ou link se não tiver id)
      const pedidosUnicos = todosPedidos.filter((pedido, idx, arr) => {
        if (pedido.id) {
          return arr.findIndex(p => p.id === pedido.id) === idx;
        } else {
          return arr.findIndex(p => p.link === pedido.link) === idx;
        }
      });
      setPedidos(pedidosUnicos);
      if (typeof window !== 'undefined') {
        localStorage.setItem('admin_pedidos', JSON.stringify(pedidosUnicos));
      }
    } catch (err) {
      // fallback para localStorage SOMENTE se a API falhar
      if (typeof window !== 'undefined') {
        const localPedidos = localStorage.getItem('admin_pedidos');
        if (localPedidos) setPedidos(JSON.parse(localPedidos));
      }
    }
  }

  // Função para deletar pedido (admin) e refletir para cliente/localStorage/backend
  async function handleDeletePedido(idx:number) {
    if(window.confirm('Tem certeza que deseja deletar este pedido?')){
      const pedido = pedidos[idx];
      // Determinar tipo do pedido (pendente ou processado)
      let tipo: 'pendente' | 'processado' = 'pendente';
      if (pedido.status === 'concluido' || pedido.status === 'falha' || pedido.success === true || pedido.success === false) {
        tipo = 'processado';
      }
      try {
        // Remove do backend
        const resp = await fetch('/api/pedidos', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: pedido.id, link: pedido.link, tipo })
        });
        // Remove do localStorage
        let pedidosLocal = JSON.parse(localStorage.getItem('admin_pedidos') || '[]');
        pedidosLocal = pedidosLocal.filter((p:any) => (p.id && p.id !== pedido.id) || (!p.id && p.link !== pedido.link));
        localStorage.setItem('admin_pedidos', JSON.stringify(pedidosLocal));
        // Remove do estado
        setPedidos(pedidos.filter((p, i) => i !== idx));
      } catch (err) {
        alert('Erro ao deletar pedido!');
      }
    }
  }

  // Função para editar pedido (admin) e refletir para cliente/localStorage/backend
  async function handleEditPedido(idx:number, novoPedido:any) {
    const pedido = pedidos[idx];
    let tipo: 'pendente' | 'processado' = 'pendente';
    if (pedido.status === 'concluido' || pedido.status === 'falha' || pedido.success === true || pedido.success === false) {
      tipo = 'processado';
    }
    try {
      // Atualiza no backend
      await fetch('/api/pedidos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pedido.id, link: pedido.link, tipo, ...novoPedido })
      });
      // Atualiza no localStorage
      let pedidosLocal = JSON.parse(localStorage.getItem('admin_pedidos') || '[]');
      pedidosLocal = pedidosLocal.map((p:any) => ((p.id && p.id === pedido.id) || (!p.id && p.link === pedido.link)) ? { ...p, ...novoPedido } : p);
      localStorage.setItem('admin_pedidos', JSON.stringify(pedidosLocal));
      // Atualiza no estado
      setPedidos(pedidos.map((p, i) => i === idx ? { ...p, ...novoPedido } : p));
    } catch (err) {
      alert('Erro ao editar pedido!');
    }
  }

  const [planos, setPlanos] = useState<any[]>([]);
  const [clientesLoaded, setClientesLoaded] = useState(false);

  // Carrega dados do localStorage só no client
  // Função para verificar status dos pedidos com a API
  const verificarStatusPedidos = async () => {
    try {
      console.log('Verificando status dos pedidos na área administrativa...');
      const timestamp = Date.now();
      const resposta = await fetch(`/api/status-pedidos?t=${timestamp}`);
      
      if (!resposta.ok) {
        console.error('Erro ao buscar status dos pedidos');
        return;
      }
      
      const { pendentes, processados } = await resposta.json();
      console.log('Pedidos pendentes:', pendentes.length);
      console.log('Pedidos processados:', processados.length);
      
      // Sincronizar pedidos do localStorage com os dados da API
      if (typeof window !== 'undefined') {
        const localPedidos = JSON.parse(localStorage.getItem(PEDIDOS_KEY) || '[]');
        let pedidosAtualizados = [...localPedidos];
        let houveAlteracao = false;
        
        console.log('Verificando pedidos processados:', processados.length, 'pendentes:', pendentes.length);
        
        // Interface para o tipo de pedido processado
        interface PedidoProcessado {
          id?: string; 
          link: string; 
          status?: string; 
          success?: boolean; 
          mensagem?: string; 
          message?: string;
          cliente?: string;
          comentarios?: string[];
        }
        
        // Adicionar pedidos processados que não estão no localStorage
        processados.forEach((pedidoProcessado: PedidoProcessado) => {
          // Encontrar o pedido no localStorage
          const idx = pedidosAtualizados.findIndex(p => 
            (pedidoProcessado.id && p.id && pedidoProcessado.id === p.id) || 
            pedidoProcessado.link === p.link
          );
          
          // Verificação mais abrangente: considera vários indicadores de conclusão
          const pedidoConcluido = 
            pedidoProcessado.status === 'concluido' || 
            pedidoProcessado.success === true ||
            (pedidoProcessado.mensagem && (
              pedidoProcessado.mensagem.includes('sucesso') ||
              (pedidoProcessado.mensagem.includes('Todos os') && pedidoProcessado.mensagem.includes('comentários'))
            )) ||
            (pedidoProcessado.message && (
              pedidoProcessado.message.includes('sucesso') ||
              (pedidoProcessado.message.includes('Todos os') && pedidoProcessado.message.includes('comentários'))
            ));

          // Se o pedido processado veio do backend e tem status concluido, garantir que o status do admin e do usuário também seja atualizado
          if (pedidoProcessado.status === 'concluido') {
            // Forçar status concluído no local
            if (idx !== -1 && pedidosAtualizados[idx].status !== 'concluido') {
              pedidosAtualizados[idx].status = 'concluido';
              houveAlteracao = true;
            }
          }
          
          if (idx !== -1) {
            // Pedido existe no localStorage, verificar se precisa atualizar
            if (pedidosAtualizados[idx].status !== 'concluido' && pedidoConcluido) {
              console.log(`Atualizando pedido ${pedidoProcessado.id || pedidoProcessado.link} para concluído`);
              pedidosAtualizados[idx].status = 'concluido';
              houveAlteracao = true;
            }
          } else if (pedidoConcluido) {
            // Pedido processado não existe no localStorage, adicionar
            console.log(`Adicionando pedido processado ${pedidoProcessado.id || pedidoProcessado.link} ao localStorage`);
            pedidosAtualizados.push({
              ...pedidoProcessado,
              status: 'concluido',
              cliente: pedidoProcessado.cliente || 'Cliente',
              enviados: pedidoProcessado.comentarios?.length || 1
            });
            houveAlteracao = true;
          }
        });
        
        // Se houve alteração, atualizar localStorage e estado
        if (houveAlteracao) {
          localStorage.setItem(PEDIDOS_KEY, JSON.stringify(pedidosAtualizados));
          setPedidos(pedidosAtualizados);
          setMsg('Status dos pedidos atualizado!');
          setTimeout(() => setMsg(''), 1500);
        }
      }
      
    } catch (error) {
      console.error('Erro ao verificar status dos pedidos:', error);
    }
  };

  // Buscar planos da API
  async function fetchPlanos() {
    try {
      const resp = await fetch('/api/planos');
      const data = await resp.json();
      setPlanos(data.planos || []);
    } catch (err) {
      // Se der erro, apenas zere os planos
      setPlanos([]);
    }
  }

  // Função global para atualizar clientes do backend
  async function fetchClientes() {
    try {
      const resp = await fetch('/api/clientes');
      const data = await resp.json();
      setClientes(data.clientes || []);
      if (typeof window !== 'undefined') {
        localStorage.setItem(CLIENTES_KEY, JSON.stringify(data.clientes || []));
      }
      setClientesLoaded(true);
    } catch (err) {
      // fallback para localStorage
      if (typeof window !== 'undefined') {
        const localClientes = localStorage.getItem(CLIENTES_KEY);
        if (localClientes) setClientes(JSON.parse(localClientes));
      }
      setClientesLoaded(true);
    }
  }

  React.useEffect(() => {
    fetchPlanos();
    fetchClientes();
    fetchPedidosAdmin(); // <-- Buscar pedidos do backend sempre ao abrir o admin

    if (typeof window !== 'undefined') {
      const localPacotes = localStorage.getItem(PACOTES_KEY);
      if (localPacotes) setPacotes(JSON.parse(localPacotes));
      // Verificar status inicial
      verificarStatusPedidos();
      // Configurar verificação automática a cada 10 segundos
      const intervalId = setInterval(() => {
        console.log('Verificação automática de status dos pedidos...');
        verificarStatusPedidos();
      }, 10000); // 10 segundos
      // Limpar intervalo quando o componente for desmontado
      return () => clearInterval(intervalId);
    }
  }, []);

  // Persistência dos dados administrativos
  React.useEffect(() => {
    if (clientesLoaded) {
      localStorage.setItem(CLIENTES_KEY, JSON.stringify(clientes));
      localStorage.setItem(PEDIDOS_KEY, JSON.stringify(pedidos));
      localStorage.setItem(PACOTES_KEY, JSON.stringify(pacotes));
      // Não persiste mais planos no localStorage
    }
  }, [clientes, pedidos, pacotes, planos, clientesLoaded]);

  // Menu de seção
  const [section, setSection] = useState<'clientes'|'pedidos'|'pacotes'|'planos'>('clientes');
  // Busca e edição
  const [busca, setBusca] = useState('');
  const [editIdx, setEditIdx] = useState<number|null>(null);
  const [editData, setEditData] = useState<any>({});
  const [novoPacote, setNovoPacote] = useState({cliente:'', pacote:'', status:'aguardando'});
  const [filtroPedido, setFiltroPedido] = useState('');
  const [msg, setMsg] = useState('');
  // Novo usuário
  const [novoUsuario, setNovoUsuario] = useState({nome:'', email:'', whatsapp:'', senha:'', comentarios:0, admin:false, simultaneos:1});

  // --- Pedidos: Funções admin ---
  function handleStopPedido(idx:number) {
    const novas = [...pedidos];
    novas[idx].status = 'parado';
    setPedidos(novas);
    if(typeof window !== 'undefined'){
      localStorage.setItem('admin_pedidos', JSON.stringify(novas));
    }
    setMsg('Pedido parado!');
    setTimeout(()=>setMsg(''), 1500);
  }
  function handleEditPedido(idx:number) {
    setEditIdx(idx);
    setEditData({...pedidos[idx]});
  }
  function handleSavePedido(idx:number) {
    const novas = [...pedidos];
    novas[idx] = {...editData};
    setPedidos(novas);
    setEditIdx(null);
    if(typeof window !== 'undefined'){
      localStorage.setItem('admin_pedidos', JSON.stringify(novas));
    }
    setMsg('Pedido atualizado!');
    setTimeout(()=>setMsg(''), 1500);
  }

  // --- Hooks de autenticação admin ---
  const [isClient, setIsClient] = useState(false);
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginSenha, setLoginSenha] = useState('');
  const [loginErro, setLoginErro] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    setIsClient(true);
    if (typeof window !== 'undefined') {
      const user = JSON.parse(localStorage.getItem('usuario_logado') || 'null');
      setUsuarioLogado(user);
    }
  }, []);

  // Adicionar comentários manualmente
  async function handleAddComentarios(idx:number, qtd:number) {
    if(isNaN(qtd) || qtd<=0) return setMsg('Informe um número válido!');
    const cliente = { ...clientes[idx], comentarios: clientes[idx].comentarios + qtd };
    try {
      const resp = await fetch('/api/clientes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cliente)
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        await fetchClientes();
        setMsg('Comentários adicionados!');
        setTimeout(()=>setMsg(''), 1500);
      } else {
        setMsg(data.error || 'Erro ao atualizar comentários!');
        setTimeout(()=>setMsg(''), 2500);
      }
    } catch (err) {
      setMsg('Erro ao atualizar comentários!');
      setTimeout(()=>setMsg(''), 2500);
    }
  }
  // Planos CRUD
  const [novoPlano, setNovoPlano] = useState({nome:'', quantidade:0, preco:0, descricao:''});
  const [editPlanoIdx, setEditPlanoIdx] = useState<number|null>(null);
  const [editPlanoData, setEditPlanoData] = useState<any>({descricao: ''});

  function handleEdit(idx:number) {
    setEditIdx(idx);
    setEditData({...clientes[idx]});
  }
  async function handleSave(idx:number) {
    const cliente = { ...editData, simultaneos: Number(editData.simultaneos) > 0 ? Number(editData.simultaneos) : 1 };
    try {
      const resp = await fetch('/api/clientes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cliente)
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        await fetchClientes();
        setEditIdx(null);
        setMsg('Cliente atualizado!');
        setTimeout(()=>setMsg(''), 1500);
      } else {
        setMsg(data.error || 'Erro ao atualizar cliente!');
        setTimeout(()=>setMsg(''), 2500);
      }
    } catch (err) {
      setMsg('Erro ao atualizar cliente!');
      setTimeout(()=>setMsg(''), 2500);
    }
  }
  async function handleToggleAdmin(idx:number) {
    const cliente = { ...clientes[idx], admin: !clientes[idx].admin };
    try {
      const resp = await fetch('/api/clientes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cliente)
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        await fetchClientes();
        setMsg(cliente.admin ? 'Usuário agora é administrador!' : 'Permissão de administrador removida!');
        setTimeout(()=>setMsg(''), 1500);
      } else {
        setMsg(data.error || 'Erro ao atualizar permissão!');
        setTimeout(()=>setMsg(''), 2500);
      }
    } catch (err) {
      setMsg('Erro ao atualizar permissão!');
      setTimeout(()=>setMsg(''), 2500);
    }
  }
  async function handleBlock(idx:number) {
    const cliente = { ...clientes[idx], status: clientes[idx].status === 'ativo' ? 'bloqueado' : 'ativo' };
    try {
      const resp = await fetch('/api/clientes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cliente)
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        await fetchClientes();
        setMsg(cliente.status === 'ativo' ? 'Cliente liberado!' : 'Cliente bloqueado!');
        setTimeout(()=>setMsg(''), 1500);
      } else {
        setMsg(data.error || 'Erro ao atualizar status!');
        setTimeout(()=>setMsg(''), 2500);
      }
    } catch (err) {
      setMsg('Erro ao atualizar status!');
      setTimeout(()=>setMsg(''), 2500);
    }
  }
  function handlePacoteAdd(e:any) {
    e.preventDefault();
    if(!novoPacote.cliente || !novoPacote.pacote) return setMsg('Preencha todos os campos do pacote!');
    setPacotes([...pacotes, {...novoPacote}]);
    setNovoPacote({cliente:'', pacote:'', status:'aguardando'});
    setMsg('Pacote criado!');
    setTimeout(()=>setMsg(''), 1500);
  }
  // Filtros
  const clientesFiltrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    c.email.toLowerCase().includes(busca.toLowerCase())
  );

  const pedidosFiltrados = pedidos;

  const handleAdminLogin = async (e:any) => {
    e.preventDefault();
    setLoginErro('');
    setLoginLoading(true);
    try {
      const clientes = JSON.parse(localStorage.getItem(CLIENTES_KEY) || '[]');
      const user = clientes.find((c:any) => c.email === loginEmail && c.senha === loginSenha && c.admin);
      if (user) {
        localStorage.setItem('usuario_logado', JSON.stringify(user));
        setUsuarioLogado(user);
        window.location.reload();
      } else {
        setLoginErro('Credenciais inválidas ou sem permissão de administrador.');
      }
    } catch {
      setLoginErro('Erro ao tentar logar.');
    }
    setLoginLoading(false);
  };

  if (!isClient || !clientesLoaded) {
    return <div style={{color:'#FFD600',textAlign:'center',marginTop:'3rem'}}>Carregando...</div>;
  }

  if (!usuarioLogado || !usuarioLogado.admin) {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#181A1B'}}>
        <div style={{background:'#232528',padding:'2.5rem 2rem',borderRadius:14,boxShadow:'0 2px 16px #0007',maxWidth:360,width:'100%'}}>
          <h2 style={{color:'#FFD600',marginBottom:24,textAlign:'center'}}>Login Administrador</h2>
          <form onSubmit={handleAdminLogin} style={{display:'flex',flexDirection:'column',gap:16}}>
            <input type="email" placeholder="Email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} style={{padding:12,borderRadius:6,border:'1.5px solid #FFD600',background:'#181A1B',color:'#FFD600',fontSize:'1rem',marginBottom:6}} required />
            <input type="password" placeholder="Senha" value={loginSenha} onChange={e=>setLoginSenha(e.target.value)} style={{padding:12,borderRadius:6,border:'1.5px solid #FFD600',background:'#181A1B',color:'#FFD600',fontSize:'1rem'}} required />
            <button type="submit" style={{marginTop:10,padding:'0.7rem',borderRadius:6,background:'#FFD600',color:'#181A1B',fontWeight:'bold',fontSize:'1.07rem',border:'none',cursor:'pointer',transition:'0.2s',letterSpacing:0.5}} disabled={loginLoading}>{loginLoading ? 'Entrando...' : 'Entrar'}</button>
            {loginErro && <div style={{color:'#F44336',marginTop:8,textAlign:'center',fontWeight:'bold'}}>{loginErro}</div>}
          </form>
          <div style={{marginTop:18,color:'#FFD600',fontSize:'0.96rem',textAlign:'center',opacity:0.8}}>Acesso restrito a administradores</div>
        </div>
      </div>
    );
  }

  return (
    <Container>
      <Title style={{textAlign:'center', width:'100%'}}>Área Administrativa</Title>
      <AdminMenu active={section} onSelect={setSection} />
      {msg && <div style={{background:'#FFD600',color:'#181A1B',padding:'8px 16px',borderRadius:8,marginBottom:16,fontWeight:'bold'}}>{msg}</div>}
      {section==='clientes' && (
        <Section>
          <h3>Clientes Registrados</h3>
          <form onSubmit={e=>{e.preventDefault();
            if(!novoUsuario.nome||!novoUsuario.email||!novoUsuario.whatsapp||!novoUsuario.senha) return setMsg('Preencha todos os campos!');
            setClientes([...clientes, {...novoUsuario, status:'ativo'}]);
            setNovoUsuario({nome:'',email:'',whatsapp:'',senha:'',comentarios:0, admin:false, simultaneos:1});
            setMsg('Usuário criado!'); setTimeout(()=>setMsg(''), 1500);}} style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
            <input type="text" placeholder="Nome" value={novoUsuario.nome} onChange={e=>setNovoUsuario({...novoUsuario,nome:e.target.value})} style={{padding:8,borderRadius:6,border:'1px solid #292B2E',background:'#181A1B',color:'#FFF'}} />
            <input type="email" placeholder="Email" value={novoUsuario.email} onChange={e=>setNovoUsuario({...novoUsuario,email:e.target.value})} style={{padding:8,borderRadius:6,border:'1px solid #292B2E',background:'#181A1B',color:'#FFF'}} />
            <input type="text" placeholder="WhatsApp" value={novoUsuario.whatsapp} onChange={e=>setNovoUsuario({...novoUsuario,whatsapp:e.target.value})} style={{padding:8,borderRadius:6,border:'1px solid #292B2E',background:'#181A1B',color:'#FFF'}} />
            <input type="password" placeholder="Senha" value={novoUsuario.senha} onChange={e=>setNovoUsuario({...novoUsuario,senha:e.target.value})} style={{padding:8,borderRadius:6,border:'1px solid #292B2E',background:'#181A1B',color:'#FFF'}} />
            <select value={novoUsuario.admin ? 'sim' : 'não'} onChange={e=>setNovoUsuario({...novoUsuario,admin:e.target.value==='sim'})} style={{padding:8,borderRadius:6,border:'1px solid #292B2E',background:'#181A1B',color:'#FFF'}}>
              <option value="sim">Sim</option>
              <option value="não">Não</option>
            </select>
            <select value={novoUsuario.simultaneos} onChange={e=>setNovoUsuario({...novoUsuario,simultaneos:Number(e.target.value)})} style={{padding:8,borderRadius:6,border:'1px solid #292B2E',background:'#181A1B',color:'#FFF'}}>
              {[1,2,3,4,5].map(q=> <option key={q} value={q}>{q} simultâneo{q>1?'s':''}</option>)}
            </select>
            <Button type="submit">Criar Novo Usuário</Button>
          </form>
          <input
            type="text"
            placeholder="Buscar por nome ou email..."
            value={busca}
            onChange={e=>setBusca(e.target.value)}
            style={{width:'100%',padding:8,borderRadius:6,border:'1px solid #292B2E',marginBottom:14,background:'#181A1B',color:'#FFF'}}
          />
          <hr style={{border:'none',borderTop:'1.5px solid #FFD600',margin:'18px 0',width:'100%'}} />
          <Table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>WhatsApp</th>
                <th>Senha</th>
                <th>Status</th>
                <th>Admin</th>
                <th>Comentários</th>
                <th>Simultâneos</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map((c, i) => (
                editIdx === i && section==='clientes' ? (
                  <tr key={i} style={{background:'#232528'}}>
                    <td>
                      <input type="text" value={editData.nome} onChange={e=>setEditData({...editData, nome: e.target.value})} style={{width:'100%',padding:4,borderRadius:4,border:'1px solid #FFD600',background:'#181A1B',color:'#FFD600'}} />
                    </td>
                    <td>
                      <input type="email" value={editData.email} onChange={e=>setEditData({...editData, email: e.target.value})} style={{width:'100%',padding:4,borderRadius:4,border:'1px solid #FFD600',background:'#181A1B',color:'#FFD600'}} />
                    </td>
                    <td>
                      <input type="text" value={editData.whatsapp} onChange={e=>setEditData({...editData, whatsapp: e.target.value})} style={{width:'100%',padding:4,borderRadius:4,border:'1px solid #FFD600',background:'#181A1B',color:'#FFD600'}} />
                    </td>
                    <td>
                      <input type="password" value={editData.senha || ''} onChange={e=>setEditData({...editData, senha: e.target.value})} style={{width:'100%',padding:4,borderRadius:4,border:'1px solid #FFD600',background:'#181A1B',color:'#FFD600'}} />
                    </td>
                    <td>
                      <select value={editData.status} onChange={e=>setEditData({...editData, status: e.target.value})} style={{padding:4,borderRadius:4,border:'1px solid #FFD600',background:'#181A1B',color:'#FFD600'}}>
                        <option value="ativo">Ativo</option>
                        <option value="bloqueado">Bloqueado</option>
                      </select>
                    </td>
                    <td>
                      <select value={editData.admin ? 'sim' : 'não'} onChange={e=>setEditData({...editData, admin: e.target.value === 'sim'})} style={{padding:4,borderRadius:4,border:'1px solid #FFD600',background:'#181A1B',color:'#FFD600'}}>
                        <option value="sim">Sim</option>
                        <option value="não">Não</option>
                      </select>
                    </td>
                    <td>
                      <input type="number" value={editData.comentarios} onChange={e=>setEditData({...editData, comentarios: Number(e.target.value)})} style={{width:70,padding:4,borderRadius:4,border:'1px solid #FFD600',background:'#181A1B',color:'#FFD600'}} />
                    </td>
                    <td>
                      <select value={editData.simultaneos} onChange={e=>setEditData({...editData, simultaneos: Number(e.target.value)})} style={{padding:4,borderRadius:4,border:'1px solid #FFD600',background:'#181A1B',color:'#FFD600'}}>
                        {[1,2,3,4,5].map(q=> <option key={q} value={q}>{q} simultâneo{q>1?'s':''}</option>)}
                      </select>
                    </td>
                    <td>
                      <Button style={{background:'#8FFF8F',color:'#181A1B'}} onClick={()=>handleSave(i)}>Salvar</Button>
                      <Button style={{background:'#FFD600',color:'#181A1B'}} onClick={()=>setEditIdx(null)}>Cancelar</Button>
                    </td>
                  </tr>
                ) : (
                  <tr key={i} style={{borderBottom: i < clientesFiltrados.length - 1 ? '1.5px solid #FFD600' : 'none'}}>
                    <td>{c.nome}</td>
                    <td>{c.email}</td>
                    <td>{c.whatsapp}</td>
                    <td>{c.senha ? '••••••••' : <span style={{color:'#FFD600'}}>Não definida</span>}</td>
                    <td>{c.status === 'ativo' ? <span style={{color:'#8FFF8F',fontWeight:'bold'}}>Ativo</span> : <span style={{color:'#FFD600',fontWeight:'bold'}}>Bloqueado</span>}</td>
                    <td>{c.admin ? <span style={{color:'#FFD600',fontWeight:'bold'}}>Sim</span> : <span style={{color:'#FFF',opacity:0.7}}>Não</span>}</td>
                    <td>{c.comentarios}</td>
                    <td>{c.simultaneos || 1}</td>
                    <td>
                      <div style={{display:'flex', flexDirection:'row', alignItems:'center', gap:'8px', flexWrap:'nowrap'}}>
                        <Button onClick={()=>handleEdit(i)}>Editar</Button>
                        <Button onClick={()=>handleBlock(i)}>{c.status === 'ativo' ? 'Bloquear' : 'Liberar'}</Button>
                        <Button onClick={()=>handleToggleAdmin(i)} style={{background:c.admin?'#1976D2':'#FFD600',color:c.admin?'#FFF':'#181A1B'}}>{c.admin ? 'Remover Admin' : 'Tornar Admin'}</Button>
                        <Button style={{background:'#F44336',color:'#FFF'}} onClick={()=>handleDeleteUser(i)}>Excluir</Button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </Table>
        </Section>
      )}
      {section==='pedidos' && (
        <Section>
          <h3>Pedidos</h3>
          <input
            type="text"
            placeholder="Filtrar por cliente..."
            value={filtroPedido}
            onChange={e=>setFiltroPedido(e.target.value)}
            style={{width:'100%',padding:8,borderRadius:6,border:'1px solid #292B2E',marginBottom:14,background:'#181A1B',color:'#FFF'}}
          />
          <Table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Link</th>
                <th>Qtd. Comentários</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pedidosFiltrados.map((p,i)=>(
                editIdx === i && section==='pedidos' ? (
                  <tr key={i} style={{background:'#232528'}}>
                    <td>{i + 1}</td>
                    <td>{p.cliente}</td>
                    <td>
                      <input type="text" value={editData.link} onChange={e=>setEditData({...editData,link:e.target.value})} style={{width:'100%',padding:4,borderRadius:4,border:'1px solid #FFD600',background:'#181A1B',color:'#FFD600'}} />
                    </td>
                    <td>
                      <input type="number" value={editData.enviados} onChange={e=>setEditData({...editData,enviados:Number(e.target.value)})} style={{width:70,padding:4,borderRadius:4,border:'1px solid #FFD600',background:'#181A1B',color:'#FFD600'}} />
                    </td>
                    <td>
                      <select value={editData.status} onChange={e=>setEditData({...editData,status:e.target.value})} style={{padding:4,borderRadius:4,border:'1px solid #FFD600',background:'#181A1B',color:'#FFD600'}}>
                        <option value="processando">Em processamento</option>
                        <option value="parado">Parado</option>
                        <option value="concluido">Concluído</option>
                      </select>
                    </td>
                    <td>
                      <Button style={{background:'#8FFF8F',color:'#181A1B'}} onClick={()=>handleSavePedido(i)}>Salvar</Button>
                      <Button style={{background:'#FFD600',color:'#181A1B'}} onClick={()=>setEditIdx(null)}>Cancelar</Button>
                    </td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <td>{p.cliente}</td>
                    <td><a href={p.link} target="_blank" rel="noopener noreferrer" style={{color:'#FFD600'}}>Ver Post</a></td>
                    <td>{Array.isArray(p.comentarios) ? p.comentarios.length : (p.enviados || 0)}</td>
                    <td>{p.status === 'concluido' ? 'Concluído' : (p.status === 'parado' ? 'Parado' : 'Em processamento')}</td>
                    <td>
                      <Button style={{background:'#F44336',color:'#FFF'}} onClick={()=>handleDeletePedido(i)}>Deletar</Button>
                      <Button style={{background:'#FFD600',color:'#181A1B'}} onClick={()=>handleStopPedido(i)}>Parar</Button>
                      <Button style={{background:'#232528',color:'#FFD600'}} onClick={()=>handleEditPedido(i)}>Editar</Button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </Table>
        </Section>
      )}
      {section==='pacotes' && (
        <Section>
          <h3>Pacotes Comprados</h3>
          <form onSubmit={handlePacoteAdd} style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
            <input
              type="text"
              placeholder="Cliente"
              value={novoPacote.cliente}
              onChange={e=>setNovoPacote({...novoPacote,cliente:e.target.value})}
              style={{padding:8,borderRadius:6,border:'1px solid #292B2E',background:'#181A1B',color:'#FFF'}}
            />
            <input
              type="text"
              placeholder="Pacote (ex: 50, 100...)"
              value={novoPacote.pacote}
              onChange={e=>setNovoPacote({...novoPacote,pacote:e.target.value})}
              style={{padding:8,borderRadius:6,border:'1px solid #292B2E',background:'#181A1B',color:'#FFF'}}
            />
            <select value={novoPacote.status} onChange={e=>setNovoPacote({...novoPacote,status:e.target.value})} style={{padding:8,borderRadius:6,border:'1px solid #292B2E',background:'#181A1B',color:'#FFF'}}>
              <option value="aguardando">Aguardando</option>
              <option value="liberado">Liberado</option>
            </select>
            <Button type="submit">Adicionar Pacote</Button>
          </form>
          <Table>
            <thead>
              <tr><th>Cliente</th><th>Pacote</th><th>Status</th></tr>
            </thead>
            <tbody>
              {pacotes.map((p,i)=>(
                <tr key={i}><td>{p.cliente}</td><td>{p.pacote}</td><td>{p.status}</td></tr>
              ))}
            </tbody>
          </Table>
        </Section>
      )}
      {section==='planos' && (
        <Section>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
            <h3>Planos Disponíveis</h3>
            <Button 
              onClick={async () => {
                try {
                  setMsg('Sincronizando planos...');
                  
                  // Adicionar timestamp para evitar cache
                  const timestamp = Date.now();
                  
                  // Buscar planos atualizados da API com parâmetro de timestamp para evitar cache
                  const resp = await fetch(`/api/planos?t=${timestamp}`, {
                    headers: {
                      'Cache-Control': 'no-cache, no-store, must-revalidate',
                      'Pragma': 'no-cache',
                      'Expires': '0'
                    }
                  });
                  
                  const data = await resp.json();
                  
                  if (data.planos) {
                    console.log('[ADMIN] Planos recebidos para sincronização:', data.planos);
                    
                    // Atualizar planos no localStorage
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('admin_planos', JSON.stringify(data.planos));
                      
                      // Criar um evento personalizado para notificar outras abas/janelas
                      try {
                        const syncEvent = new StorageEvent('storage', {
                          key: 'admin_planos',
                          newValue: JSON.stringify(data.planos)
                        });
                        
                        // Disparar o evento para outras abas/janelas
                        window.dispatchEvent(syncEvent);
                        console.log('[ADMIN] Evento de sincronização disparado');
                      } catch (e) {
                        console.error('[ADMIN] Erro ao disparar evento de sincronização:', e);
                      }
                    }
                    
                    // Atualizar estado local
                    setPlanos(data.planos);
                    
                    // Executar script de sincronização se disponível
                    if (data.syncScript && typeof window !== 'undefined') {
                      try {
                        console.log('[ADMIN] Executando script de sincronização');
                        // eslint-disable-next-line no-eval
                        eval(data.syncScript);
                      } catch (e) {
                        console.error('[ADMIN] Erro ao executar script de sincronização:', e);
                      }
                    }
                    
                    // Forçar recarregamento da página de planos em todas as abas abertas
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('force_planos_reload', timestamp.toString());
                    }
                    
                    setMsg('Planos sincronizados com sucesso!');
                    setTimeout(() => setMsg(''), 2000);
                  } else {
                    setMsg('Erro ao sincronizar planos: dados inválidos');
                    setTimeout(() => setMsg(''), 2500);
                  }
                } catch (err) {
                  console.error('[ADMIN] Erro ao sincronizar planos:', err);
                  setMsg('Erro ao sincronizar planos');
                  setTimeout(() => setMsg(''), 2500);
                }
              }}
              style={{background: '#4CAF50', color: '#FFF', display: 'flex', alignItems: 'center', gap: '6px'}}
            >
              <span style={{fontSize: '1.1rem'}}>↻</span> Sincronizar Planos
            </Button>
          </div>
          <form onSubmit={async e => {
            e.preventDefault();
            if(!novoPlano.nome||!novoPlano.quantidade||!novoPlano.preco) return setMsg('Preencha todos os campos do plano!');
            // LOG: plano a ser enviado
            console.log('[ADMIN] Enviando novo plano:', novoPlano);
            try {
              const resp = await fetch('/api/planos', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(novoPlano)
              });
              const data = await resp.json();
              console.log('[ADMIN] Resposta da API ao criar plano:', data);
              if (resp.ok && data.plano) {
                setPlanos([...planos, data.plano]);
                setNovoPlano({nome:'',quantidade:0,preco:0, descricao:''});
                setMsg('Plano criado!');
                setTimeout(()=>setMsg(''), 1500);
              } else {
                setMsg(data.error || 'Erro ao criar plano.');
                setTimeout(()=>setMsg(''), 2500);
              }
            } catch (err) {
              console.error('[ADMIN] Erro ao criar plano:', err);
              setMsg('Erro ao criar plano.');
              setTimeout(()=>setMsg(''), 2500);
            }
          }} style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
            <input type="text" placeholder="Nome do Plano" value={novoPlano.nome} onChange={e=>setNovoPlano({...novoPlano,nome:e.target.value})} style={{padding:8,borderRadius:6,border:'1px solid #292B2E',background:'#181A1B',color:'#FFF'}} />
            <input type="number" placeholder="Qtd. Comentários" value={novoPlano.quantidade||''} onChange={e=>setNovoPlano({...novoPlano,quantidade:Number(e.target.value)})} style={{padding:8,borderRadius:6,border:'1px solid #292B2E',background:'#181A1B',color:'#FFF',width:120}} />
            <input type="number" placeholder="Preço (R$)" value={novoPlano.preco||''} onChange={e=>setNovoPlano({...novoPlano,preco:Number(e.target.value)})} style={{padding:8,borderRadius:6,border:'1px solid #292B2E',background:'#181A1B',color:'#FFF',width:120}} />
            <input type="text" placeholder="Descrição personalizada (opcional)" value={novoPlano.descricao} onChange={e=>setNovoPlano({...novoPlano,descricao:e.target.value})} style={{padding:8,borderRadius:6,border:'1px solid #292B2E',background:'#181A1B',color:'#FFD600',width:260}} />
            <Button type="submit">Adicionar Plano</Button>
          </form>
          <Table>
            <thead>
              <tr><th>Nome</th><th>Qtd. Comentários</th><th>Preço (R$)</th><th>Descrição</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {planos.map((p,i)=>(
                <tr key={i}>
                  <td>{editPlanoIdx===i ? <input value={editPlanoData.nome} onChange={e=>setEditPlanoData({...editPlanoData,nome:e.target.value})} style={{width:'100%',background:'#232528',color:'#FFD600',border:'1px solid #FFD600',borderRadius:4}}/> : p.nome}</td>
                  <td>{editPlanoIdx===i ? <input type="number" value={editPlanoData.quantidade} onChange={e=>setEditPlanoData({...editPlanoData,quantidade:Number(e.target.value)})} style={{width:'100%',background:'#232528',color:'#FFD600',border:'1px solid #FFD600',borderRadius:4}}/> : p.quantidade}</td>
                  <td>{editPlanoIdx===i ? <input type="number" value={editPlanoData.preco} onChange={e=>setEditPlanoData({...editPlanoData,preco:Number(e.target.value)})} style={{width:'100%',background:'#232528',color:'#FFD600',border:'1px solid #FFD600',borderRadius:4}}/> : p.preco.toFixed(2)}</td>
                  <td>{editPlanoIdx===i ? <input value={editPlanoData.descricao||''} onChange={e=>setEditPlanoData({...editPlanoData,descricao:e.target.value})} style={{width:'100%',background:'#232528',color:'#FFD600',border:'1px solid #FFD600',borderRadius:4}}/> : (p.descricao || <span style={{color:'#FFD600',opacity:0.7}}>—</span>)}</td>
                  <td>
                    {editPlanoIdx===i ? (
                      <>
                        <Button onClick={async () => {
                          try {
                            const resp = await fetch('/api/planos', {
                              method: 'PUT',
                              headers: {'Content-Type': 'application/json'},
                              body: JSON.stringify({ ...editPlanoData, id: planos[i].id })
                            });
                            const data = await resp.json();
                            if (resp.ok && data.success) {
                              const novos = [...planos];
                              novos[i] = data.plano;
                              setPlanos(novos); setEditPlanoIdx(null); setMsg('Plano atualizado!'); setTimeout(()=>setMsg(''), 1500);
                            } else {
                              setMsg(data.error || 'Erro ao atualizar plano.'); setTimeout(()=>setMsg(''), 2500);
                            }
                          } catch (err) {
                            setMsg('Erro ao atualizar plano.'); setTimeout(()=>setMsg(''), 2500);
                          }
                        }}>Salvar</Button>
                        <Button onClick={()=>setEditPlanoIdx(null)}>Cancelar</Button>
                      </>
                    ) : (
                      <>
                        <Button onClick={() => {setEditPlanoIdx(i);setEditPlanoData({...p});}}>Editar</Button>
                        <Button style={{background:'#F44336',color:'#FFF'}} onClick={async () => {
                          if(window.confirm('Tem certeza que deseja excluir este plano?')){
                            try {
                              const resp = await fetch('/api/planos', {
                                method: 'DELETE',
                                headers: {'Content-Type': 'application/json'},
                                body: JSON.stringify({ id: p.id })
                              });
                              const data = await resp.json();
                              if (resp.ok && data.success) {
                                const novos = planos.filter((_, idx) => idx !== i);
                                setPlanos(novos);
                                setMsg('Plano excluído!'); setTimeout(()=>setMsg(''), 1500);
                              } else {
                                setMsg(data.error || 'Erro ao excluir plano.'); setTimeout(()=>setMsg(''), 2500);
                              }
                            } catch (err) {
                              setMsg('Erro ao excluir plano.'); setTimeout(()=>setMsg(''), 2500);
                            }
                          }
                        }}>Excluir</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      )}
    </Container>
  );
}

