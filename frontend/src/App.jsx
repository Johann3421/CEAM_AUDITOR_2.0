import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import ScraperControl from './pages/ScraperControl';

// Placeholder for missing modules
const SettingsPage = () => <div className="p-10"><h1>Configuración</h1><p className="subtitle">Módulo en desarrollo...</p></div>;

function App() {
  return (
    <Router>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/scraper" element={<ScraperControl />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
