import React from 'react';

interface SummaryCardProps {
  title: string;
  value: string | number;
  unit?: string;
}

const SummaryCard = ({ title, value, unit }: SummaryCardProps) => {
  return (
    <div className="bg-ds-navy p-5 rounded-lg border border-ds-border text-center transform hover:-translate-y-1 transition-transform duration-200">
      <h3 className="text-ds-text text-sm font-normal uppercase tracking-wider mb-2">{title}</h3>
      <p className="text-ds-green text-5xl font-bold">
        {value}
        {unit && <span className="text-ds-text text-base ml-1.5">{unit}</span>}
      </p>
    </div>
  );
};

export default SummaryCard;
