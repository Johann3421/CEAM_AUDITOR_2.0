import React from 'react';
import { ExternalLink, FileText, Calendar, Building2, User } from 'lucide-react';

const OrderTable = ({ orders, loading }) => {
  if (loading) {
    return (
      <div className="p-20 text-center animate-pulse">
        <div className="h-8 bg-white/5 rounded w-full mb-4"></div>
        <div className="h-8 bg-white/5 rounded w-full mb-4"></div>
        <div className="h-8 bg-white/5 rounded w-full mb-4"></div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="p-20 text-center glass-effect mt-8">
        <FileText size={48} className="mx-auto text-white/10 mb-4" />
        <p className="text-white/40">No se encontraron órdenes con los filtros actuales.</p>
      </div>
    );
  }

  return (
    <div className="data-table-container glass-effect mt-8 p-1">
      <table>
        <thead>
          <tr>
            <th>Nro. Orden Física</th>
            <th>Entidad / Proveedor</th>
            <th>Publicación</th>
            <th>Monto (PEN)</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="animate-fade">
              <td>
                <div className="font-semibold text-blue-400">{order.nro_orden_fisica}</div>
                <div className="text-[10px] text-white/40 truncate w-32">{order.codigo_acuerdo_marco}</div>
              </td>
              <td>
                <div className="flex items-center gap-2 mb-1">
                  <Building2 size={12} className="text-emerald-500" />
                  <span className="font-medium truncate max-w-[200px]">{order.nombre_entidad}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User size={12} className="text-blue-500" />
                  <span className="text-xs text-white/60 truncate max-w-[200px]">{order.nombre_proveedor}</span>
                </div>
              </td>
              <td>
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <Calendar size={12} />
                  {new Date(order.fecha_publicacion).toLocaleDateString()}
                </div>
              </td>
              <td className="font-bold">
                {order.monto_total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
              </td>
              <td>
                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                  order.estado_orden?.toLowerCase().includes('aceptada') 
                    ? 'bg-emerald-500/10 text-emerald-500' 
                    : 'bg-amber-500/10 text-amber-500'
                }`}>
                  {order.estado_orden || 'S/E'}
                </span>
              </td>
              <td>
                <a 
                  href={order.pdf_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors inline-block text-blue-400"
                  title="Ver detalle / PDF"
                >
                  <ExternalLink size={18} />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default OrderTable;
