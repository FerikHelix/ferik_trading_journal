import Decimal from 'decimal.js';
import type { Deal, Position } from '../domain/types';

const sum = (deals: Deal[], field: 'profit' | 'commission' | 'swap') =>
  deals.reduce((total, deal) => total.plus(deal[field]), new Decimal(0));

function weightedPrice(deals: Deal[]): string {
  const volume = deals.reduce((total, deal) => total.plus(deal.volume), new Decimal(0));
  if (volume.isZero()) return '0';
  return deals.reduce((total, deal) => total.plus(new Decimal(deal.price).times(deal.volume)), new Decimal(0)).div(volume).toString();
}

export function aggregatePositions(deals: Deal[]): Position[] {
  const groups = new Map<string, Deal[]>();
  for (const deal of deals.filter((item) => item.event !== 'balance')) {
    const reference = deal.positionId || deal.orderId || deal.ticketId;
    const key = `${deal.accountId}:${reference}`;
    groups.set(key, [...(groups.get(key) ?? []), deal]);
  }
  return [...groups.entries()].map(([id, items]) => {
    const sorted = [...items].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const entries = sorted.filter((deal) => deal.event === 'entry');
    const exits = sorted.filter((deal) => deal.event === 'exit');
    const first = entries[0] ?? sorted[0];
    const embedded = sorted.find((deal) => deal.embeddedOpenAt);
    const entryVolume = entries.reduce((n, deal) => n.plus(deal.volume), new Decimal(0));
    const exitVolume = exits.reduce((n, deal) => n.plus(deal.volume), new Decimal(0));
    const isEmbeddedClosed = Boolean(embedded?.embeddedOpenAt && exits.length);
    const closed = isEmbeddedClosed || (entryVolume.gt(0) && exitVolume.gte(entryVolume));
    const gross = sum(sorted, 'profit');
    const commission = sum(sorted, 'commission');
    const swap = sum(sorted, 'swap');
    const volume = entryVolume.gt(0) ? entryVolume : exitVolume;
    return {
      id,
      accountId: first.accountId,
      positionId: first.positionId || first.orderId || first.ticketId,
      symbol: first.symbol,
      side: entries[0]?.side ?? first.side,
      openAt: embedded?.embeddedOpenAt ?? first.occurredAt,
      closeAt: closed ? exits.at(-1)?.occurredAt ?? sorted.at(-1)?.occurredAt : undefined,
      averageOpenPrice: embedded?.embeddedOpenPrice ?? weightedPrice(entries),
      averageClosePrice: weightedPrice(exits),
      volume: volume.toString(),
      grossProfit: gross.toString(),
      commission: commission.toString(),
      swap: swap.toString(),
      netProfit: gross.plus(commission).plus(swap).toString(),
      stopLoss: first.stopLoss,
      takeProfit: first.takeProfit,
      status: closed ? 'closed' : 'open',
      dealIds: sorted.map((deal) => deal.id),
      groupingFallback: !first.positionId,
    };
  });
}
