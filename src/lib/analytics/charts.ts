import type { ChartConfiguration } from 'chart.js';
import type { EquityPoint, SeriesPoint } from './index';

export interface ChartPalette { grid: string; text: string; positive: string; negative: string; accent: string; accentFill: string; neutral: string; }

export function readChartPalette(): ChartPalette {
  const fallback: ChartPalette = { grid: '#202A35', text: '#8D9AA8', positive: '#2DD48A', negative: '#FF5C6C', accent: '#4C8DFF', accentFill: 'rgb(76 141 255 / 12%)', neutral: '#687789' };
  if (typeof document === 'undefined') return fallback;
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, value: string) => styles.getPropertyValue(name).trim() || value;
  return { grid: token('--chart-grid', fallback.grid), text: token('--text-secondary', fallback.text), positive: token('--profit', fallback.positive), negative: token('--loss', fallback.negative), accent: token('--chart-line', fallback.accent), accentFill: token('--chart-line-fill', fallback.accentFill), neutral: token('--chart-neutral', fallback.neutral) };
}

function cartesianOptions(palette: ChartPalette) { return {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: palette.text } } },
  scales: {
    x: { ticks: { color: palette.text }, grid: { color: palette.grid } },
    y: { ticks: { color: palette.text }, grid: { color: palette.grid } },
  },
} as const; }

export function cumulativeChart(points: EquityPoint[], palette = readChartPalette()): ChartConfiguration<'line'> {
  return {
    type: 'line',
    data: {
      labels: points.map((point) => point.at),
      datasets: [{ label: 'Cumulative P&L', data: points.map((point) => Number(point.cumulativeProfit)), borderColor: palette.accent, backgroundColor: palette.accentFill, fill: true, tension: 0.25, pointRadius: 2 }],
    },
    options: cartesianOptions(palette),
  };
}

export function performanceBarChart(label: string, points: SeriesPoint[], palette = readChartPalette()): ChartConfiguration<'bar'> {
  return {
    type: 'bar',
    data: {
      labels: points.map((point) => point.label),
      datasets: [{ label, data: points.map((point) => Number(point.netProfit ?? 0)), backgroundColor: points.map((point) => Number(point.netProfit ?? 0) >= 0 ? palette.positive : palette.negative) }],
    },
    options: cartesianOptions(palette),
  };
}

export function outcomeChart(wins: number, losses: number, breakeven: number, palette = readChartPalette()): ChartConfiguration<'doughnut'> {
  return {
    type: 'doughnut',
    data: { labels: ['Win', 'Loss', 'Breakeven'], datasets: [{ data: [wins, losses, breakeven], backgroundColor: [palette.positive, palette.negative, palette.neutral], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: palette.text } } } },
  };
}
