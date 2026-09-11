import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { subscribeToThemeChange } from '../lib/theme';

interface Props {
  labels: string[];
  values: number[];
  type?: 'line' | 'bar' | 'doughnut';
  label?: string;
}

export default function ChartPanel({ labels, values, type = 'line', label = 'P&L' }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    if (!canvas.current) return;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const chart = new Chart(canvas.current, {
      type,
      data: {
        labels,
        datasets: [{
          label,
          data: values,
          borderColor: token('--chart-line'),
          backgroundColor: type === 'line' ? token('--chart-line-fill') : [token('--profit'), token('--loss'), token('--chart-neutral'), token('--info'), token('--warning')],
          borderWidth: 2,
          pointRadius: type === 'line' ? 0 : undefined,
          pointHoverRadius: 4,
          tension: .28,
          fill: type === 'line',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: type === 'doughnut', labels: { color: token('--text-secondary'), boxWidth: 10 } }, tooltip: { displayColors: false, backgroundColor: token('--surface'), titleColor: token('--text-primary'), bodyColor: token('--text-secondary'), borderColor: token('--border'), borderWidth: 1 } },
        scales: type === 'doughnut' ? undefined : {
          x: { grid: { display: false }, ticks: { color: token('--text-tertiary'), maxTicksLimit: 7, font: { size: 10 } } },
          y: { grid: { color: token('--chart-grid') }, ticks: { color: token('--text-tertiary'), maxTicksLimit: 5, font: { size: 10 } } },
        },
      },
    });
    return () => chart.destroy();
  }, [labels.join('|'), values.join('|'), type, label, themeVersion]);

  useEffect(() => subscribeToThemeChange(() => setThemeVersion((version) => version + 1)), []);

  return <canvas ref={canvas} aria-label={`Grafik ${label}`} role="img" />;
}
