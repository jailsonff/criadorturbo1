import Image from 'next/image';
import styled from 'styled-components';
import { useState } from 'react';

const CLIENTES_KEY = 'admin_clientes';
const USUARIO_LOGADO_KEY = 'usuario_logado';

const Container = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #111;
  color: #FFD600;
  padding: 2rem 1rem;
`;
const Box = styled.div`
  background: #181818;
  border-radius: 18px;
  padding: 2.5rem 2rem 2rem 2rem;
  box-shadow: 0 6px 32px #000a;
  max-width: 370px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
`;
const Title = styled.h2`
  margin-bottom: 1.2rem;
  color: #FFD600;
  font-size: 2rem;
  font-weight: bold;
`;
const StyledForm = styled.form`
  width: 100%;
  display: flex;
  flex-direction: column;
`;
const Field = styled.div`
  width: 100%;
  margin-bottom: 1.2rem;
`;
const Label = styled.label`
  display: flex;
  align-items: center;
  color: #FFD600;
  margin-bottom: 0.3rem;
  font-size: 1rem;
`;
const Icon = styled.span`
  display: inline-flex;
  align-items: center;
  margin-right: 0.6rem;
  font-size: 1.2rem;
`;
const Input = styled.input`
  width: 100%;
  padding: 0.85rem 1rem;
  border: none;
  border-radius: 8px;
  background: #222;
  color: #FFD600;
  font-size: 1rem;
  outline: none;
  box-shadow: 0 1px 3px #0003;
  transition: box-shadow 0.2s, border 0.2s;
  &:focus {
    box-shadow: 0 0 0 2px #FFD60099;
    background: #191919;
  }
`;
const LogoWrapper = styled.div`
  position: relative;
  width: 300px;
  height: 200px;
  margin-bottom: 1rem;
`;

const Button = styled.button`
  width: 100%;
  padding: 1.1rem 0;
  background: linear-gradient(90deg, #FFD600 80%, #FFC400);
  color: #111;
  border: none;
  border-radius: 8px;
  font-size: 1.15rem;
  font-weight: bold;
  margin-top: 0.5rem;
  cursor: pointer;
  box-shadow: 0 2px 8px #0006;
  transition: background 0.2s;
  letter-spacing: 1px;
  &:hover {
    background: linear-gradient(90deg, #FFC400 80%, #FFD600);
  }
`;
const Switch = styled.div`
  margin-top: 1.5rem;
  color: #FFD600;
  text-align: center;
  font-size: 1rem;
`;
import { useRouter } from 'next/router';
export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isRegister) {
      // Cadastro centralizado via API
      if (!nome || !email || !whatsapp || !senha) {
        setErro('Preencha todos os campos!');
        return;
      }
      try {
        const resp = await fetch('/api/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, email, whatsapp, senha })
        });
        if (resp.status === 409) {
          setErro('Já existe uma conta com este e-mail.');
          return;
        }
        if (!resp.ok) {
          setErro('Erro ao registrar. Tente novamente.');
          return;
        }
        const data = await resp.json();
        // Atualiza localStorage com lista mais recente
        const listaResp = await fetch('/api/clientes');
        const lista = await listaResp.json();
        if (typeof window !== 'undefined') {
          localStorage.setItem(CLIENTES_KEY, JSON.stringify(lista.clientes || []));
          localStorage.setItem(USUARIO_LOGADO_KEY, JSON.stringify(data.cliente));
        }
        router.push('/dashboard');
      } catch (err) {
        setErro('Erro de conexão. Tente novamente.');
      }
    } else {
      // Login
      try {
        // Busca lista de clientes do backend
        const listaResp = await fetch('/api/clientes');
        const lista = await listaResp.json();
        const clientes = lista.clientes || [];
        const usuario = clientes.find((c:any) => c.email === email && c.senha === senha);
        if (!usuario) {
          setErro('E-mail ou senha inválidos!');
          return;
        }
        if (usuario.status !== 'ativo') {
          setErro('Usuário bloqueado. Entre em contato com o suporte.');
          return;
        }
        if (typeof window !== 'undefined') {
          localStorage.setItem(CLIENTES_KEY, JSON.stringify(clientes));
          localStorage.setItem(USUARIO_LOGADO_KEY, JSON.stringify(usuario));
        }
        router.push('/dashboard');
      } catch (err) {
        setErro('Erro ao conectar. Tente novamente.');
      }
    }
  }

  return (
    <Container>
      <Box>
        <LogoWrapper>
          <Image 
            src="/logo-login.png" 
            alt="Logo da Ferramenta" 
            fill
            sizes="300px"
            style={{ objectFit: 'contain' }}
          />
        </LogoWrapper>
        <Title>{isRegister ? 'Criar Conta' : 'Login'}</Title>
        <StyledForm onSubmit={handleSubmit}>
           {isRegister && (
             <Field>
               <Label><Icon>👤</Icon>Nome de usuário</Label>
               <Input placeholder="Nome de usuário" required value={nome} onChange={e=>setNome(e.target.value)} />
             </Field>
           )}
           <Field>
             <Label><Icon>📧</Icon>E-mail válido</Label>
             <Input type="email" placeholder="E-mail válido" required value={email} onChange={e=>setEmail(e.target.value)} />
           </Field>
           {isRegister && (
             <Field>
               <Label><Icon>📱</Icon>WhatsApp</Label>
               <Input placeholder="WhatsApp" required value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} />
             </Field>
           )}
           <Field>
             <Label><Icon>🔒</Icon>Senha</Label>
             <Input type="password" placeholder="Senha" required value={senha} onChange={e=>setSenha(e.target.value)} />
           </Field>
          <Button type="submit">{isRegister ? 'Cadastrar' : 'Entrar'}</Button>
        </StyledForm>
         {erro && <div style={{color:'#F44336',marginBottom:12,fontWeight:'bold'}}>{erro}</div>}
         <Switch>
           {isRegister ? (
             <>Já tem conta? <a href="#" style={{color:'#FFD600',textDecoration:'underline'}} onClick={e=>{e.preventDefault();setIsRegister(false);setErro('');}}>Entrar</a></>
           ) : (
             <>Não tem conta? <a href="#" style={{color:'#FFD600',textDecoration:'underline'}} onClick={e=>{e.preventDefault();setIsRegister(true);setErro('');}}>Cadastre-se</a></>
           )}
         </Switch>
      </Box>
    </Container>
  );
}
