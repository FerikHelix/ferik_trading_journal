import Decimal from 'decimal.js';
import { z } from 'zod';
import type { AttestedRule, DecimalString, SoftRuleCaps, TotalLossMode } from '../domain/types';
import { firmDayKey } from './day';

/**
 * The machine block of a plan.
 *
 * A plan is markdown, because that is what the user and their AI can read and
 * edit together. One fenced ```json block inside it carries the numbers the
 * product computes with. Nothing here calls a model: the paste is the contract.
 */
export interface PlanMachine {
  firm: string;
  phase: string;
  startingBalance: DecimalString;
  effectiveFrom: string;
  resetTime: string;
  resetTimeZone: string;
  maxDailyLossPct: number | null;
  maxTotalLossPct: number | null;
  totalLossMode: TotalLossMode;
  profitTargetPct: number | null;
  minTradingDays: number | null;
  consistencyPct: number | null;
  softCaps: SoftRuleCaps;
}

export interface PlanError {
  path: string;
  message: string;
}

export type PlanParseResult =
  | { ok: true; machine: PlanMachine; attested: AttestedRule[]; markdown: string }
  | { ok: false; errors: PlanError[]; markdown: string };

/** Accepts numbers written as numbers or as numeric strings, which AI output mixes freely. */
const toNumber = (value: unknown) => {
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value.trim().replace('%', ''));
    return Number.isNaN(numeric) ? value : numeric;
  }
  return value;
};

const percent = z.preprocess(toNumber, z.number().min(0).max(100));
const nullablePercent = percent.nullable().default(null);
const count = z.preprocess(toNumber, z.number().int().nonnegative());
const nullableCount = count.nullable().default(null);

const positiveDecimal = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => {
    try {
      return new Decimal(value).isFinite() && new Decimal(value).gt(0);
    } catch {
      return false;
    }
  }, 'Saldo awal harus angka positif');

const machineSchema = z.object({
  firm: z.string().default(''),
  phase: z.string().default(''),
  startingBalance: positiveDecimal,
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus berformat YYYY-MM-DD')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Tanggal tidak valid'),
  resetTime: z.string().regex(/^\d{1,2}:\d{2}$/, 'Jam reset harus berformat HH:mm'),
  resetTimeZone: z.string().min(1, 'Zona waktu reset wajib diisi'),
  maxDailyLossPct: nullablePercent,
  maxTotalLossPct: nullablePercent,
  totalLossMode: z.enum(['static', 'trailing']).default('static'),
  profitTargetPct: nullablePercent,
  minTradingDays: nullableCount,
  consistencyPct: nullablePercent,
  softCaps: z
    .object({
      tradesPerDay: count.optional(),
      lotsPerDay: z.preprocess(toNumber, z.number().positive()).optional(),
    })
    .default({}),
});

const FENCE = /```json[ \t]*\r?\n([\s\S]*?)```/i;
const CHECKBOX = /^[ \t]*[-*][ \t]+\[[ xX]\][ \t]+(.+?)[ \t]*$/gm;

function slug(text: string): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'rule';
}

/**
 * Checkbox lines become attested rules. Their ids are derived from the text so a
 * tick survives a re-paste of an unchanged plan; editing a rule's wording gives
 * it a new id, which is the honest outcome because it is a different promise.
 */
export function parseAttestedRules(markdown: string): AttestedRule[] {
  const rules: AttestedRule[] = [];
  const used = new Map<string, number>();
  for (const match of markdown.matchAll(CHECKBOX)) {
    const text = match[1].trim();
    if (!text) continue;
    const id = slug(text);
    const seen = used.get(id) ?? 0;
    used.set(id, seen + 1);
    rules.push({ id: seen === 0 ? id : `${id}-${seen + 1}`, text });
  }
  return rules;
}

/** The first fenced json block, verbatim. */
export function extractMachineBlock(markdown: string): string | undefined {
  return FENCE.exec(markdown)?.[1]?.trim();
}

export function parsePlanMarkdown(markdown: string): PlanParseResult {
  const block = extractMachineBlock(markdown);
  if (!block) {
    return {
      ok: false,
      markdown,
      errors: [{ path: 'markdown', message: 'Blok ```json berisi angka plan tidak ditemukan.' }],
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(block);
  } catch {
    return { ok: false, markdown, errors: [{ path: 'json', message: 'Blok json tidak dapat dibaca sebagai JSON.' }] };
  }

  const parsed = machineSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      markdown,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.') || 'json',
        message: issue.message,
      })),
    };
  }

  // The schema can only check the shape of the clock; the platform knows whether
  // the zone exists and the reset time is in range.
  try {
    firmDayKey(new Date(), { resetTime: parsed.data.resetTime, resetTimeZone: parsed.data.resetTimeZone });
  } catch (caught) {
    return {
      ok: false,
      markdown,
      errors: [{ path: 'resetTime', message: caught instanceof Error ? caught.message : 'Jam reset tidak valid.' }],
    };
  }

  return { ok: true, machine: parsed.data, attested: parseAttestedRules(markdown), markdown };
}
