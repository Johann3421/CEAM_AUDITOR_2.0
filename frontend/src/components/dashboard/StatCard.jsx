import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const StatCard = ({ label, value, trend, isPositive, prefix = '', onClick, title }) => {
  const handleKey = (e) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick();
  };

  return (
    <div
      className={`stat-card fade-up${onClick ? ' clickable' : ''}`}
      onClick={onClick}
      onKeyDown={handleKey}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={title}
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
    </div>
  );
};

export default StatCard;
