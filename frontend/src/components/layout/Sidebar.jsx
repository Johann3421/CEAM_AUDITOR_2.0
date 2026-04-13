import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Table, Cpu, FileSearch, BookOpen, Settings } from 'lucide-react';

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/orders', icon: Table, label: 'Órdenes de Compra' },
  { to: '/fichas-catalogo', icon: BookOpen, label: 'Fichas Producto' },
  { to: '/scraper', icon: Cpu, label: 'Scraper — Órdenes' },
  { to: '/fichas', icon: FileSearch, label: 'Scraper — Fichas' },
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
