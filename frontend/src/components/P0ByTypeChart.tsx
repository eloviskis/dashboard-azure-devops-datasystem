import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://backend-hazel-three-14.vercel.app';

const P0ByTypeChart: React.FC = () => {
  const [data, setData] = useState<{ type: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/stats/p0-by-type`)
      .then(res => res.json())
      .then(resData => {
        setData(resData);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Carregando...</div>;

  const chartData = {
    labels: data.map(item => item.type),
    datasets: [
      {
        label: 'Quantidade de P0 por Tipo',
        data: data.map(item => item.count),
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
      },
    ],
  };

  return (
    <div>
      <h3>P0 por Tipo</h3>
      <Bar data={chartData} />
    </div>
  );
};

export default P0ByTypeChart;
