import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import ScraperControl from './pages/ScraperControl';

function App() {
  return (
    <Router>
      <div className="app-shell">
        <Sidebar />
        <main className="page-container">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/scraper" element={<ScraperControl />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
