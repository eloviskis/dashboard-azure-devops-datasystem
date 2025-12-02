import React from 'react';
import './ChartInfoLamp.css';

interface ChartInfoLampProps {
  info: string;
}

const ChartInfoLamp: React.FC<ChartInfoLampProps> = ({ info }) => (
  <span className="chart-info-lamp">
    <span
      className="chart-info-lamp-icon"
      tabIndex={0}
      aria-label="Informação do gráfico"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFD600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="chart-info-lamp-svg">
        <circle cx="12" cy="12" r="10" stroke="#FFD600" fill="#FFFDE7" />
        <path d="M9 12a3 3 0 1 1 6 0c0 1.5-1.5 2.5-3 2.5" />
        <line x1="12" y1="17" x2="12" y2="17" />
      </svg>
      <span className="chart-info-tooltip">
        {info}
      </span>
    </span>
  </span>
);

export default ChartInfoLamp;
