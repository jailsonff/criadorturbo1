import styled from 'styled-components';
import Link from 'next/link';

const MenuBar = styled.nav`
  width: 100%;
  background: #181818;
  padding: 0.5rem 0;
  display: flex;
  justify-content: center;
  box-shadow: 0 2px 8px #0004;
  margin-bottom: 2.5rem;
`;
const MenuLink = styled.a<{$active?: boolean}>`
  color: #FFD600;
  font-weight: bold;
  font-size: 1.1rem;
  padding: 0.7rem 1.6rem;
  border-radius: 6px;
  margin: 0 0.5rem;
  background: ${({$active}) => $active ? '#222' : 'none'};
  text-decoration: none;
  transition: background 0.2s;
  &:hover {
    background: #222;
  }
`;

interface UserMenuProps {
  active: 'dashboard' | 'pedido' | 'planos' | 'editar-perfil';
}

export default function UserMenu({ active }: UserMenuProps) {
  return (
    <MenuBar>
      <Link href="/dashboard" passHref legacyBehavior>
        <MenuLink $active={active==='dashboard'}>Dashboard</MenuLink>
      </Link>
      <Link href="/pedido" passHref legacyBehavior>
        <MenuLink $active={active==='pedido'}>Pedidos</MenuLink>
      </Link>
      <Link href="/planos" passHref legacyBehavior>
        <MenuLink $active={active==='planos'}>Planos</MenuLink>
      </Link>
      <Link href="/editar-perfil" passHref legacyBehavior>
        <MenuLink $active={active==='editar-perfil'}>Editar Perfil</MenuLink>
      </Link>
    </MenuBar>
  );
}
