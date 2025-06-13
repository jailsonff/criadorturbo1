import { useState } from 'react';
import styled from 'styled-components';
import UserMenu from '../components/UserMenu';

const Container = styled.div`
  min-height: 100vh;
  background: #111;
  color: #FFD600;
  padding: 2rem 1rem;
  text-align: center;
`;
const Form = styled.form`
  background: #181818;
  border-radius: 10px;
  padding: 2rem 1.2rem;
  margin: 2rem auto;
  max-width: 420px;
  box-shadow: 0 2px 12px #0007;
`;
const Input = styled.input`
  width: 100%;
  padding: .8rem;
  margin-bottom: 1.2rem;
  border-radius: 6px;
  border: none;
  background: #222;
  color: #FFD600;
`;
const Label = styled.label`
  display: block;
  text-align: left;
  margin-bottom: 0.3rem;
  font-size: 1rem;
`;
const Button = styled.button`
  width: 100%;
  padding: 1rem;
  background: #FFD600;
  color: #111;
  border: none;
  border-radius: 6px;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  margin-top: .5rem;
  transition: background 0.2s;
  &:hover {
    background: #FFC400;
  }
`;
const Success = styled.div`
  margin: 1rem 0;
  padding: 0.8rem;
  background: #FFD600;
  color: #111;
  border-radius: 6px;
  font-weight: bold;
`;

export default function EditarPerfil() {
  // MOCK: dados do usuário logado
  const [nome, setNome] = useState('Ricardo');
  const [email] = useState('ricardo@email.com');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: any) {
    e.preventDefault();
    // Aqui você faria a chamada para API de atualização
    // Exemplo de validação simples
    if(novaSenha && novaSenha !== confirmarSenha) {
      alert('As senhas não coincidem!');
      return;
    }
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  return (
    <>
      <UserMenu active="dashboard" />
      <Container>
        <h2>Editar Perfil</h2>
        <Form onSubmit={handleSubmit}>
          <Label>Nome completo</Label>
          <Input value={nome} onChange={e=>setNome(e.target.value)} required />
          <Label>Email</Label>
          <Input value={email} disabled />
          <Label>Nova senha</Label>
          <Input type="password" value={novaSenha} onChange={e=>setNovaSenha(e.target.value)} placeholder="Nova senha" />
          <Label>Confirmar nova senha</Label>
          <Input type="password" value={confirmarSenha} onChange={e=>setConfirmarSenha(e.target.value)} placeholder="Confirme a nova senha" />
          <Button type="submit">Salvar alterações</Button>
          {success && <Success>Perfil atualizado com sucesso!</Success>}
        </Form>
      </Container>
    </>
  );
}
