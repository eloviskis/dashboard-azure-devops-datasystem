import React from 'react';

const containerStyle: React.CSSProperties = { 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center', 
    height: '100%', 
    minHeight: '300px',
    color: '#8892B0',
    textAlign: 'center'
};

export const EmptyState = ({ message }: { message: string }) => (
  <div style={containerStyle}>
    <p>{message}</p>
  </div>
);

export const LoadingState = () => (
    <div style={containerStyle}>
      <p>Carregando dados...</p>
    </div>
);
