import React, { useState, useEffect, useCallback } from 'react';
import { purchaseOrdersApi } from '../services/api';
import OrderTable from '../components/orders/OrderTable';
import { Search, Filter, ChevronLeft, ChevronRight, X } from 'lucide-react';

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [limit] = useState(25);
  
  // Filters state
  const [search, setSearch] = useState('');
  const [catalogo, setCatalogo] = useState('');
  const [categoria, setCategoria] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await purchaseOrdersApi.getAll({
        skip: page * limit,
        limit,
        catalogo: catalogo || undefined,
        categoria: categoria || undefined,
        nombre_entidad: search || undefined
      });
      setOrders(response.data);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  }, [page, limit, catalogo, categoria, search]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(0);
    fetchOrders();
  };

  const resetFilters = () => {
    setSearch('');
    setCatalogo('');
    setCategoria('');
    setPage(0);
  };

  return (
    <div className="animate-fade">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1>Órdenes de Compra</h1>
          <p className="subtitle">Explora y filtra el historial de adquisiciones</p>
        </div>
        
        <div className="flex gap-4 mb-1">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            Mostrando {orders.length} resultados
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="glass-effect p-4 flex flex-wrap gap-4 items-center">
        <form onSubmit={handleSearch} className="flex-1 relative min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text"
            className="input-custom pl-10"
            placeholder="Buscar por entidad..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <div className="flex gap-4">
          <select 
            className="input-custom w-auto bg-white"
            value={catalogo}
            onChange={(e) => setCatalogo(e.target.value)}
          >
            <option value="">Todos los Catálogos</option>
            <option value="Útiles de Escritorio">Útiles de Escritorio</option>
            <option value="Computadoras Desktop">Computadoras Desktop</option>
            <option value="Servicio de Impresión">Servicio de Impresión</option>
          </select>

          {(search || catalogo || categoria) && (
            <button 
              onClick={resetFilters}
              className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
              title="Limpiar filtros"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      <OrderTable orders={orders} loading={loading} />

      {/* Pagination */}
      <div className="flex justify-center items-center gap-6 mt-8">
        <button 
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0 || loading}
          className={`p-2 rounded-full glass-effect ${page === 0 ? 'opacity-20' : 'hover:bg-gray-100'}`}
        >
          <ChevronLeft size={24} />
        </button>
        <span className="text-sm font-medium">Página {page + 1}</span>
        <button 
          onClick={() => setPage(page + 1)}
          disabled={orders.length < limit || loading}
          className={`p-2 rounded-full glass-effect ${orders.length < limit ? 'opacity-20' : 'hover:bg-gray-100'}`}
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </div>
  );
};

export default Orders;
