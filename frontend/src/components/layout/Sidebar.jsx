import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Table, Database, Settings, Shield } from 'lucide-react';

const Sidebar = () => {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Shield size={32} />
        <span>CEAM 2.0</span>
      </div>
      
      <nav style={{ flex: 1 }}>
        <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/orders" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          <Table size={20} />
          <span>Órdenes de Compra</span>
        </NavLink>
        <NavLink to="/scraper" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          <Database size={20} />
          <span>Scraper & Jobs</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <NavLink to="/settings" className="nav-link">
          <Settings size={20} />
          <span>Configuración</span>
        </NavLink>
      </div>
    </aside>
  );
};

export default Sidebar;
