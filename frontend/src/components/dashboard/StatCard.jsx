import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const StatCard = ({ label, value, trend, isPositive, prefix = '', onClick, title, tooltip }) => {
  const handleKey = (e) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick();
  };

  return (
    <div
      className={`stat-card fade-up${onClick ? ' clickable' : ''}${tooltip ? ' has-tooltip' : ''}`}
      onClick={onClick}
      onKeyDown={handleKey}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={!tooltip ? title : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{prefix}{value}</div>
      {trend && (
        <span className={`stat-card-trend ${isPositive ? 'positive' : 'negative'}`}>
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {trend}
        </span>
      )}
      {tooltip && (
        <div className="stat-tooltip">{tooltip}</div>
      )}
      {onClick && (
        <div className="stat-card-hint">
          <span>Ver detalles →</span>
        </div>
      )}
    </div>
  );
};

export default StatCard;
