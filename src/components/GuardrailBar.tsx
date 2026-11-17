import type { ComponentChildren } from 'preact';
import type { Reading, ReadingConfidence } from '../lib/domain/types';
import { money, share } from './format';

const CONFIDENCE_LABEL: Record<ReadingConfidence, string> = {
  exact: 'exact',
  estimate: 'estimate',
  attested: 'attested',
};

/**
 * A limit as a bar.
 *
 * The confidence word is not decoration: a realized-only daily loss reading cannot
 * prove an intraday breach did not happen, so it must never look as authoritative
 * as an exact one.
 */
export default function GuardrailBar({
  label,
  reading,
  note,
  currency,
  inverse = false,
}: {
  label: string;
  reading: Reading;
  note?: ComponentChildren;
  currency: string;
  /** For progress toward a target, filling the bar is good, not dangerous. */
  inverse?: boolean;
}) {
  const used = reading.usedPct ?? 0;
  const tone = inverse
    ? used >= 1 ? 'good' : used >= 0.5 ? 'watch' : ''
    : used >= 1 ? 'breach' : used >= 0.8 ? 'watch' : '';
  return (
    <div className={`guardrail ${tone ? `guardrail--${tone}` : ''}`.trim()}>
      <div className="guardrail__head">
        <span className="guardrail__label">{label}</span>
        <span className={`badge guardrail__confidence guardrail__confidence--${reading.confidence}`}>
          {CONFIDENCE_LABEL[reading.confidence]}
        </span>
      </div>
      <div className="guardrail__track" role="img" aria-label={`${label}: ${share(used)} used`}>
        <span className="guardrail__fill" style={{ width: `${Math.min(100, Math.max(0, used * 100))}%` }} />
      </div>
      <div className="guardrail__foot">
        <span>{money(reading.value, currency)} of {money(reading.limit, currency)}</span>
        <span>{share(used)}</span>
      </div>
      {note ? <p className="guardrail__note">{note}</p> : null}
    </div>
  );
}
