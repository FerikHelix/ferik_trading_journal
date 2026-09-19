import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { subscribeToThemeChange } from '../lib/theme';

interface Props {
  labels: string[];
  values: number[];
  type?: 'line' | 'bar' | 'doughnut';
  label?: string;
  valueFormatter?: (value: number) => string;
}

/**
 * Colours come from CSS custom properties read off the document at build time,
 * so a theme switch is handled by rebuilding the chart rather than by mirroring
 * the palette in JS.
 *
 * Because getComputedStyle returns the raw declared string and canvas cannot
 * parse it, every --chart-* token must be plain hex or 8-digit hex. A
 * color-mix() value would come back as literal text and silently render black.
 */
export default function ChartPanel({
  labels,
  values,
  type = 'line',
  label = 'P&L',
  valueFormatter,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [themeVersion, setThemeVersion] = useState(0);

  // Callers pass inline arrow functions, whose identity changes on every
  // parent render. Holding the formatter in a ref keeps it out of the effect's
  // dependencies, so the chart is no longer destroyed and rebuilt each render.
  const formatterRef = useRef(valueFormatter);
  formatterRef.current = valueFormatter;

  useEffect(() => {
    if (!canvas.current) return;
    const context = canvas.current.getContext('2d');
    if (!context) return;

    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const isLine = type === 'line';

    const lineFill = () => {
      const gradient = context.createLinearGradient(0, 0, 0, canvas.current?.clientHeight || 260);
      gradient.addColorStop(0, token('--chart-line-fill'));
      gradient.addColorStop(1, token('--chart-line-fade'));
      return gradient;
    };

    const backgroundColor = isLine
      ? lineFill()
      : type === 'bar'
        ? values.map((value) => (value >= 0 ? token('--chart-bull') : token('--chart-bear')))
        : [token('--chart-1'), token('--chart-2'), token('--chart-3'), token('--chart-4'), token('--chart-5'), token('--chart-6')];

    const chart = new Chart(canvas.current, {
      type,
      data: {
        labels,
        datasets: [{
          label,
          data: values,
          // Only the line gets the brand stroke. Bars previously inherited it
          // and rendered red/green fills inside a blue outline; doughnut arcs
          // now use the surface colour as a separator instead.
          borderColor: isLine ? token('--chart-line') : type === 'doughnut' ? token('--surface') : 'transparent',
          backgroundColor,
          borderWidth: isLine ? 2 : type === 'doughnut' ? 2 : 0,
          borderRadius: type === 'bar' ? 4 : undefined,
          pointRadius: isLine ? 0 : undefined,
          pointHoverRadius: 4,
          tension: .28,
          fill: isLine,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: type === 'doughnut',
            labels: { color: token('--text-secondary'), boxWidth: 10, usePointStyle: true },
          },
          tooltip: {
            displayColors: false,
            padding: 10,
            cornerRadius: 8,
            backgroundColor: token('--surface'),
            titleColor: token('--text-primary'),
            bodyColor: token('--text-secondary'),
            borderColor: token('--border'),
            borderWidth: 1,
            callbacks: {
              label: (item) => {
                const value = Number(item.parsed);
                const format = formatterRef.current;
                return `${label}: ${format ? format(value) : String(value)}`;
              },
            },
          },
        },
        scales: type === 'doughnut' ? undefined : {
          x: {
            grid: { display: false },
            border: { color: token('--chart-axis') },
            ticks: { color: token('--text-tertiary'), maxTicksLimit: 7, font: { size: 10 } },
          },
          y: {
            grid: { color: token('--chart-grid') },
            border: { display: false },
            ticks: { color: token('--text-tertiary'), maxTicksLimit: 5, font: { size: 10 } },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [labels.join('|'), values.join('|'), type, label, themeVersion]);

  useEffect(() => subscribeToThemeChange(() => setThemeVersion((version) => version + 1)), []);

  return <canvas ref={canvas} aria-label={`Grafik ${label}`} role="img" />;
}
