import styled from 'styled-components';
import Link from 'next/link';

const Hero = styled.section`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: #181A1B;
  color: #FFF;
  padding: 2rem;
  text-align: center;
`;

const Title = styled.h1`
  font-size: 2.5rem;
  font-weight: bold;
  margin-bottom: 1.2rem;
  color: #FFF;
`;

const Subtitle = styled.h2`
  font-size: 1.3rem;
  margin-bottom: 2rem;
  color: #FFD600;
  text-align: center;
`;

const Highlight = styled.span`
  color: #FFD600;
  background: #181A1B;
  padding: 0.2em 0.5em;
  border-radius: 4px;
`;

const Button = styled.a`
  background: #FFD600;
  color: #111;
  padding: 1rem 2.5rem;
  border-radius: 8px;
  font-size: 1.2rem;
  font-weight: bold;
  margin-top: 2rem;
  box-shadow: 0 2px 8px #0006;
  transition: background 0.2s;
  &:hover {
    background: #FFC400;
  }
`;

const Footer = styled.footer`
  width: 100%;
  text-align: center;
  font-size: 0.9rem;
  color: #888;
  margin-top: 6rem; /* Aumenta o espaço acima do rodapé */
`;

export default function Home() {
  return (
    <Hero>
      <Title>FERRAMENTA Especialista em Comentários para Instagram</Title>
      <Subtitle>
        <Highlight>Sofre com pouco engajamento?</Highlight><br />
        Nossa ferramenta conecta <b>perfis reais</b> que comentam em suas publicações!
      </Subtitle>
      <p style={{ maxWidth: 700, margin: '0 auto', color: '#FFD600', fontSize: '1.15rem', textAlign: 'center', lineHeight: 1.7 }}>
        Basta colocar o link do seu post, descrever como gostaria que as pessoas comentassem e pronto: os comentários serão enviados da forma que você deseja!<br /><br />
        <b>Super fácil de usar, seguro e rápido!</b>
      </p>
      <Link href="/login" legacyBehavior>
        <a style={{
          background: '#FFD600',
          color: '#111',
          padding: '1rem 2.5rem',
          borderRadius: '8px',
          fontSize: '1.2rem',
          fontWeight: 'bold',
          marginTop: '2rem',
          boxShadow: '0 2px 8px #0006',
          display: 'inline-block',
          transition: 'background 0.2s',
        }}>Entrar / Cadastrar</a>
      </Link>
      <Footer>todos os direitos reservados agencia recife</Footer>
    </Hero>
  );
}
