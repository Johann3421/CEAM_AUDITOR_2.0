import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import ScraperControl from './pages/ScraperControl';
import FichasControl from './pages/FichasControl';
import Fichas from './pages/Fichas';
import PreciosFichas from './pages/PreciosFichas';
import Providers from './pages/Providers';
import ProveedorFichas from './pages/ProveedorFichas';
import FiltroPiezas from './pages/FiltroPiezas';

function App() {
  return (
    <Router>
      <div className="app-shell">
        <Sidebar />
        <main className="page-container">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/fichas-catalogo" element={<Fichas />} />
            <Route path="/providers" element={<Providers />} />
            <Route path="/precios-fichas" element={<PreciosFichas />} />
            <Route path="/proveedores-fichas" element={<ProveedorFichas />} />
            <Route path="/filtro-piezas" element={<FiltroPiezas />} />
            <Route path="/scraper" element={<ScraperControl />} />
            <Route path="/fichas" element={<FichasControl />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
