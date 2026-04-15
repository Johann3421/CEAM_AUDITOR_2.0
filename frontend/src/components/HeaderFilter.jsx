import React, { useState, useEffect, useRef } from 'react';
import { Filter, Search, Check } from 'lucide-react';

const HeaderFilter = ({ title, column, currentFilter, onFilterChange, apiCall }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const popoverRef = useRef();

  useEffect(() => {
    if (isOpen && options.length === 0) {
      setLoading(true);
      apiCall(column)
        .then(res => setOptions(res.data.values))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen, column, options.length, apiCall]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative' }}>
      {title}
      <div 
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        style={{ 
          cursor: 'pointer', 
          padding: 4, 
          borderRadius: 4, 
          background: currentFilter || isOpen ? 'var(--c-brand-light)' : 'transparent',
          color: currentFilter ? 'var(--c-brand)' : 'var(--c-text-tertiary)',
          display: 'flex', alignItems: 'center'
        }}
      >
        <Filter size={12} strokeWidth={currentFilter ? 3 : 2} />
      </div>
      
      {isOpen && (
        <div ref={popoverRef} className="card fade-up" style={{
          position: 'absolute', top: 24, left: 0, zIndex: 100, 
          width: 260, minHeight: 100, maxHeight: 350, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)', padding: 0, overflow: 'hidden',
          backgroundColor: 'var(--c-bg)'
        }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={14} color="var(--c-text-tertiary)" />
            <input 
              autoFocus
              type="text" 
              placeholder="Buscar..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: 13, color: 'var(--c-text)' }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            {loading ? (
              <div style={{ padding: '12px', textAlign: 'center', fontSize: 12, color: 'var(--c-text-tertiary)' }}>Cargando...</div>
            ) : (
              <>
                <div 
                  onClick={() => { onFilterChange(''); setIsOpen(false); }}
                  style={{ 
                    padding: '6px 16px', fontSize: 12, cursor: 'pointer', 
                    background: !currentFilter ? 'var(--c-bg-secondary)' : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 8,
                    color: 'var(--c-text)'
                  }}
                >
                  <div style={{ width: 14, height: 14, borderRadius: 3, border: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: !currentFilter ? 'var(--c-brand)' : 'transparent' }}>
                    {!currentFilter && <Check size={10} color="#fff" />}
                  </div>
                  (Seleccionar todo)
                </div>
                {filteredOptions.map((opt, idx) => {
                  const isSelected = currentFilter === opt;
                  return (
                    <div 
                      key={idx}
                      onClick={() => { onFilterChange(opt); setIsOpen(false); }}
                      style={{ 
                        padding: '6px 16px', fontSize: 12, cursor: 'pointer', 
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        color: 'var(--c-text)'
                      }}
                    >
                      <div style={{ width: 14, height: 14, marginTop: 2, flexShrink: 0, borderRadius: 3, border: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isSelected ? 'var(--c-brand)' : 'transparent' }}>
                        {isSelected && <Check size={10} color="#fff" />}
                      </div>
                      <span style={{ lineHeight: 1.3 }}>{opt}</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HeaderFilter;
