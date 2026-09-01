import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Table, Cpu, FileSearch, BookOpen, DollarSign, Building2, Layers, Settings } from 'lucide-react';

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/fichas', icon: FileSearch, label: 'Extraer Fichas' },
  { to: '/scraper', icon: Cpu, label: 'Extraer Órdenes' },
  { to: '/fichas-catalogo', icon: BookOpen, label: 'Ficha Producto' },
  { to: '/precios-fichas', icon: DollarSign, label: 'Precio por Ficha' },
  { to: '/orders', icon: Table, label: 'Órdenes de Compra' },
  { to: '/filtro-piezas', icon: Layers, label: 'Filtro por Piezas' },
  { to: '/proveedores-fichas', icon: Building2, label: 'Filtro por Proveedores' },
];

const Sidebar = () => {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">CA</div>
          <div>
            <div className="sidebar-brand-text">CEAM Auditor</div>
            <div className="sidebar-brand-sub">Perú Compras · v2.0</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <a href="#" className="sidebar-link" onClick={(e) => e.preventDefault()}>
          <Settings size={18} />
          <span>Configuración</span>
        </a>
      </div>
    </aside>
  );
};

export default Sidebar;
