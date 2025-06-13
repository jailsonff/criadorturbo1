import styled from 'styled-components';

const MenuBar = styled.nav`
  width: 100%;
  background: #181818;
  padding: 0.5rem 0;
  display: flex;
  justify-content: center;
  box-shadow: 0 2px 8px #0004;
  margin-bottom: 2.5rem;
`;
const MenuLink = styled.button<{$active?: boolean}>`
  color: #FFD600;
  font-weight: bold;
  font-size: 1.1rem;
  padding: 0.7rem 1.6rem;
  border-radius: 6px;
  margin: 0 0.5rem;
  background: ${({$active}) => $active ? '#222' : 'none'};
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  &:hover {
    background: #222;
  }
`;

interface AdminMenuProps {
  active: 'clientes' | 'pedidos' | 'pacotes' | 'planos';
  onSelect: (section: 'clientes' | 'pedidos' | 'pacotes' | 'planos') => void;
}

export default function AdminMenu({ active, onSelect }: AdminMenuProps) {
  return (
    <MenuBar>
      <MenuLink $active={active==='clientes'} onClick={()=>onSelect('clientes')}>Clientes Registrados</MenuLink>
      <MenuLink $active={active==='pedidos'} onClick={()=>onSelect('pedidos')}>Pedidos</MenuLink>
      <MenuLink $active={active==='pacotes'} onClick={()=>onSelect('pacotes')}>Pacotes Comprados</MenuLink>
      <MenuLink $active={active==='planos'} onClick={()=>onSelect('planos')}>Planos</MenuLink>
    </MenuBar>
  );
}
