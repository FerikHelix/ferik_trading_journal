import type { ComponentChildren } from 'preact';
import Icon from './Icon';
import type { IconName } from './icons';

/**
 * Shared primitives.
 *
 * These are .tsx rather than .astro on purpose: every page body in this app is
 * a hydrated React island, and an Astro component cannot be rendered from
 * React. They stay thin wrappers over the global classes, so plain
 * `class="card"` in an .astro template produces the identical result.
 */

export type Tone = 'neutral' | 'profit' | 'loss' | 'warning' | 'info' | 'brand';

const TONE_CLASS: Record<Tone, string> = {
  neutral: '',
  profit: 'badge--profit',
  loss: 'badge--loss',
  warning: 'badge--warning',
  info: 'badge--info',
  brand: 'badge--brand',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ComponentChildren }) {
  return <span className={`badge ${TONE_CLASS[tone]}`.trim()}>{children}</span>;
}

export function Card({
  title,
  description,
  badge,
  action,
  flush = false,
  className = '',
  children,
}: {
  title?: ComponentChildren;
  description?: ComponentChildren;
  badge?: ComponentChildren;
  action?: ComponentChildren;
  flush?: boolean;
  className?: string;
  children: ComponentChildren;
}) {
  const hasHead = title || description || badge || action;
  return (
    <section className={`card ${flush ? 'card--flush' : ''} ${className}`.trim()}>
      {hasHead && (
        <div className="card__head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {badge ?? action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  foot,
  tone,
  delta,
}: {
  label: ComponentChildren;
  value: ComponentChildren;
  foot?: ComponentChildren;
  tone?: 'profit' | 'loss';
  delta?: { text: string; direction: 'up' | 'down' | 'flat' };
}) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ''}`.trim()}>{value}</div>
      <div className="stat-foot">
        {delta && (
          <span className={`stat-delta ${delta.direction === 'up' ? 'profit' : delta.direction === 'down' ? 'loss' : ''}`.trim()}>
            {delta.direction !== 'flat' && (
              <Icon name={delta.direction === 'up' ? 'trending-up' : 'trending-down'} size={13} />
            )}
            {delta.text}
          </span>
        )}
        {delta && foot ? ' · ' : null}
        {foot}
      </div>
    </div>
  );
}

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
  compact = false,
}: {
  icon?: IconName;
  title: string;
  description?: ComponentChildren;
  action?: ComponentChildren;
  compact?: boolean;
}) {
  return (
    <div className={`empty ${compact ? 'compact' : ''}`.trim()}>
      <div>
        <div className="empty-icon"><Icon name={icon} size={20} /></div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
        {action}
      </div>
    </div>
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: ComponentChildren;
  children: ComponentChildren;
}) {
  const className = tone === 'info' ? 'notice notice--info' : `notice ${tone}`;
  return (
    <div className={className} role={tone === 'error' ? 'alert' : undefined}>
      <div>
        {title && <strong className="notice__title">{title}</strong>}
        {children}
      </div>
    </div>
  );
}

export function Skeleton({ height = 14, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} />;
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid stats-grid">
      {Array.from({ length: count }, (_, index) => (
        <div className="card" key={index}>
          <Skeleton />
          <div className="u-mt-4"><Skeleton height={26} width="55%" /></div>
        </div>
      ))}
    </div>
  );
}

export function SideBadge({ side }: { side: 'buy' | 'sell' }) {
  // Direction is not profitability: a losing buy must not render green.
  return <span className={`side side--${side}`}>{side}</span>;
}

export function Tabs<T extends string>({
  items,
  active,
  onChange,
  label,
}: {
  items: Array<{ id: T; label: string; count?: number }>;
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={active === item.id}
          className={`tab ${active === item.id ? 'active' : ''}`.trim()}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {typeof item.count === 'number' && ` (${item.count})`}
        </button>
      ))}
    </div>
  );
}

export { Icon };
export type { IconName };
