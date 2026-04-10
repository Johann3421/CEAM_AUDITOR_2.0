import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const StatCard = ({ label, value, trend, isPositive, prefix = "" }) => {
  return (
    <div className="glass-effect stat-card animate-fade">
      <span className="stat-label">{label}</span>
      <div className="stat-value">{prefix}{value}</div>
      {trend && (
        <span className={`stat-trend ${isPositive ? 'trend-up' : 'text-red-500'}`}>
          {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {trend}
        </span>
      )}
    </div>
  );
};

export default StatCard;
