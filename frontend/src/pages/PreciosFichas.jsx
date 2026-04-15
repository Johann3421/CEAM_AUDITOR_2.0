import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
...

const PreciosFichas = () => {
  const navigate = useNavigate();
  const [stats, setStats]           = useState(null);
  const [fichas, setFichas]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [enriching, setEnriching]   = useState(false);
  const [enrichResult, setEnrichResult] = useState(null);
  const [page, setPage]             = useState(0);
  const [soloConPrecio, setSoloConPrecio] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentSearch, setCurrentSearch] = useState('');
  const limit = 50;

  const fetchStats = useCallback(async () => {
    try {
      const r = await preciosFichasApi.getStats();
      setStats(r.data);
    } catch (_) {}
  }, []);

  const fetchFichas = useCallback(async () => {
    setLoading(true);
    try {
      const params = { skip: page * limit, limit };
      if (soloConPrecio) params.con_precio = true;
      if (currentSearch) params.search = currentSearch;
      const r = await fichasProductoApi.getAll(params);
      setFichas(r.data);
    } catch (_) {} finally {
      setLoading(false);
    }
  }, [page, soloConPrecio, currentSearch]);

  ...
  
  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentSearch(searchTerm);
    setPage(0);
  };
...
      {/* Toolbar */}
      <div className="toolbar" style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 250 }}>
          <div className="search-input" style={{ flex: 1, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--c-text-tertiary)' }} />
            <input
              type="text"
              placeholder="Buscar por Nro Parte, Marca o Descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: 'var(--radius)', border: '1px solid var(--c-border)', fontSize: 13 }}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px' }}>Buscar</button>
        </form>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={soloConPrecio}
            onChange={(e) => setSoloConPrecio(e.target.checked)}
          />
          Solo fichas con precio
        </label>
        <button className="btn" onClick={fetchFichas} disabled={loading} title="Recargar" style={{ padding: '8px 16px' }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Recargar
        </button>
      </div>

...
                      <td style={{ textAlign: 'right', fontWeight: 600, color: f.precio_referencia ? 'var(--c-text)' : 'var(--c-text-tertiary)' }}>
                        {fmt(f.precio_referencia)}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--c-text-secondary)' }}>
                        {f.orden_min ? (
                          <div
                            onClick={() => navigate(`/orders?search=${f.orden_min}`)}
                            title={`Ir a orden: ${f.orden_min}`}
                            style={{ cursor: 'pointer', color: 'var(--c-brand)', textDecoration: 'underline' }}
                          >
                            {fmt(f.precio_min)}
                          </div>
                        ) : (
                          fmt(f.precio_min)
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--c-text-secondary)' }}>
                        {f.orden_max ? (
                          <div
                            onClick={() => navigate(`/orders?search=${f.orden_max}`)}
                            title={`Ir a orden: ${f.orden_max}`}
                            style={{ cursor: 'pointer', color: 'var(--c-brand)', textDecoration: 'underline' }}
                          >
                            {fmt(f.precio_max)}
                          </div>
                        ) : (
                          fmt(f.precio_max)
                        )}
                      </td>
                      <td><VolBadge vol={f.precio_volatilidad} /></td>
                      <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--c-text-tertiary)' }}>
                        {f.n_ordenes_precio ?? '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0 || loading}
          className="btn btn-sm"
        >
          <ChevronLeft size={16} /> Anterior
        </button>
        <span className="pagination-info">Página {page + 1}</span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={fichas.length < limit || loading}
          className="btn btn-sm"
        >
          Siguiente <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default PreciosFichas;
