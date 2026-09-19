import { useEffect, useRef, useState } from 'preact/hooks';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesPrimitive,
  type SeriesAttachedParameter,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../lib/market/types';
import type { OrderBlock } from '../lib/smc';
import { subscribeToThemeChange } from '../lib/theme';

interface Props {
  candles: Candle[];
  blocks: OrderBlock[];
  digits: number;
  height?: number;
  label: string;
}

/** Reads a design token so the chart matches the rest of the app in both themes. */
function readTokens() {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    bull: token('--chart-bull'),
    bear: token('--chart-bear'),
    grid: token('--chart-grid'),
    axis: token('--chart-axis'),
    text: token('--text-tertiary'),
    surface: token('--surface'),
    border: token('--border'),
  };
}

/** Hex -> rgba, so a zone can be filled translucently without a second token. */
function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface ZoneStyle { fill: string; stroke: string; }

/**
 * Draws the order-block zones as rectangles behind the candles.
 *
 * lightweight-charts has no rectangle API, so this is a series primitive: it
 * gets the chart and series on attach, converts each zone's price bounds and
 * start time into canvas coordinates, and paints them. Each zone runs from the
 * candle that formed it to the right edge, which is how an untested zone is
 * normally drawn.
 */
class OrderBlockZones implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private view: IPrimitivePaneView;

  constructor(private blocks: OrderBlock[], private styles: (block: OrderBlock) => ZoneStyle) {
    const self = this;
    this.view = {
      // Behind the candles, so price action stays readable on top of the fill.
      zOrder: () => 'bottom',
      renderer(): IPrimitivePaneRenderer {
        return {
          draw(target) {
            target.useBitmapCoordinateSpace((scope) => {
              const { context, horizontalPixelRatio: hr, verticalPixelRatio: vr, mediaSize } = scope;
              const chart = self.chart;
              const series = self.series;
              if (!chart || !series) return;

              for (const block of self.blocks) {
                const top = series.priceToCoordinate(block.top);
                const bottom = series.priceToCoordinate(block.bottom);
                if (top === null || bottom === null) continue;

                const rawLeft = chart.timeScale().timeToCoordinate(
                  Math.floor(block.t / 1000) as UTCTimestamp,
                );
                // A zone that formed before the visible range still needs to be
                // drawn; clamp it to the left edge rather than skipping it.
                const left = rawLeft === null ? 0 : Math.max(0, rawLeft);
                const right = mediaSize.width;
                if (right <= left) continue;

                const style = self.styles(block);
                const x = left * hr;
                const width = (right - left) * hr;
                const y = Math.min(top, bottom) * vr;
                const height = Math.max(1, Math.abs(bottom - top) * vr);

                context.fillStyle = style.fill;
                context.fillRect(x, y, width, height);

                context.strokeStyle = style.stroke;
                context.lineWidth = Math.max(1, Math.round(hr));
                context.beginPath();
                context.moveTo(x, y);
                context.lineTo(x + width, y);
                context.moveTo(x, y + height);
                context.lineTo(x + width, y + height);
                context.stroke();
              }
            });
          },
        };
      },
    };
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<'Candlestick'>;
  }

  detached() {
    this.chart = null;
    this.series = null;
  }

  paneViews() {
    return [this.view];
  }
}

export default function CandleChart({ candles, blocks, digits, height = 280, label }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => subscribeToThemeChange(() => setThemeVersion((version) => version + 1)), []);

  useEffect(() => {
    const element = container.current;
    if (!element || candles.length === 0) return;

    const tokens = readTokens();
    const chart = createChart(element, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: tokens.text,
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: tokens.grid },
        horzLines: { color: tokens.grid },
      },
      rightPriceScale: { borderColor: tokens.axis },
      timeScale: { borderColor: tokens.axis, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      localization: {
        priceFormatter: (price: number) => price.toFixed(digits),
      },
      handleScale: { axisPressedMouseMove: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: tokens.bull,
      downColor: tokens.bear,
      borderUpColor: tokens.bull,
      borderDownColor: tokens.bear,
      wickUpColor: tokens.bull,
      wickDownColor: tokens.bear,
      priceFormat: { type: 'price', precision: digits, minMove: 1 / 10 ** digits },
    });

    series.setData(candles.map((candle) => ({
      time: Math.floor(candle.t / 1000) as UTCTimestamp,
      open: candle.o,
      high: candle.h,
      low: candle.l,
      close: candle.c,
    })));

    // Only zones price can still react to are drawn. Mitigated and invalidated
    // ones were previously painted faintly, which is what made the chart hard
    // to read — several stacked rectangles competing with the candles.
    const live = blocks.filter((block) =>
      block.status === 'fresh' || block.status === 'approaching' || block.status === 'touched');

    const zones = new OrderBlockZones(live, (block) => {
      const base = block.direction === 'bullish' ? tokens.bull : tokens.bear;
      // The zone price is actually at gets a stronger fill than a distant one.
      const near = block.status === 'touched' || block.status === 'approaching';
      return {
        fill: withAlpha(base, near ? 0.18 : 0.1),
        stroke: withAlpha(base, near ? 0.8 : 0.45),
      };
    });
    series.attachPrimitive(zones);

    chart.timeScale().fitContent();

    const resize = () => chart.applyOptions({ width: element.clientWidth });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [candles, blocks, digits, height, themeVersion]);

  if (candles.length === 0) return null;

  return <div className="candle-chart" ref={container} role="img" aria-label={`Grafik candlestick ${label}`} />;
}
