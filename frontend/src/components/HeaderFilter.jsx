import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Filter, Search, Check } from 'lucide-react';

const HeaderFilter = ({ title, column, currentFilter, onFilterChange, apiCall }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const popoverRef = useRef();
  const iconWrapRef = useRef();

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
    if (isOpen && iconWrapRef.current) {
      const rect = iconWrapRef.current.getBoundingClientRect();
      // Position fixed below the icon
      setCoords({ top: rect.bottom + 4, left: rect.left });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target) &&
          iconWrapRef.current && !iconWrapRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    const handleScroll = (event) => {
      // Close on scroll if it's not scrolling inside the popover itself
      if (popoverRef.current && popoverRef.current.contains(event.target)) return;
      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const filteredOptions = options.filter(o => {
    if (o == null) return false;
    return String(o).toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {title}
      <div 
        ref={iconWrapRef}
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
      
      {isOpen && createPortal(
        <div ref={popoverRef} className="card fade-up" style={{
          position: 'fixed', top: coords.top, left: coords.left, zIndex: 999999, 
          width: 260, minHeight: 100, maxHeight: 350, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)', padding: 0, overflow: 'hidden',
          backgroundColor: 'var(--c-bg)', border: '1px solid var(--c-border)'
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
        </div>,
        document.body
      )}
    </div>
  );
};

export default HeaderFilter;
