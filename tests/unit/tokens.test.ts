import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the theme token contract.
 *
 * The bug this exists to prevent: --chart-bull and --chart-bear were once
 * declared with the SAME value in both themes, which made light-mode charts
 * almost invisible (#22C783 on white is 1.9:1). A missing or copy-pasted token
 * is invisible in review but very visible to the user.
 */
const css = readFileSync(resolve(__dirname, '../../src/styles/tokens.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const index = css.indexOf(selector);
  if (index === -1) throw new Error(`Selector not found: ${selector}`);
  const open = css.indexOf('{', index);
  const close = css.indexOf('\n}', open);
  const body = css.slice(open + 1, close);

  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

const dark = block("[data-theme='dark']");
const light = block("[data-theme='light']");

describe('theme tokens', () => {
  it('defines the same token set in both themes', () => {
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
  });

  it('declares a non-trivial number of tokens', () => {
    expect(Object.keys(dark).length).toBeGreaterThan(30);
  });

  it('gives chart marks different values per theme', () => {
    // These are graphic marks sitting on opposite backgrounds; one value
    // cannot be legible on both.
    for (const token of ['--chart-bull', '--chart-bear', '--chart-grid'] as const) {
      expect(light[token], `${token} must differ between themes`).not.toBe(dark[token]);
    }
  });

  it('keeps colour-mix() out of every --chart-* token', () => {
    // ChartPanel passes these straight to canvas via getComputedStyle, which
    // returns the raw declared string. canvas cannot parse color-mix().
    for (const tokens of [dark, light]) {
      for (const [name, value] of Object.entries(tokens)) {
        if (!name.startsWith('--chart-')) continue;
        expect(value, `${name} must be a plain colour`).not.toContain('color-mix');
        expect(value, `${name} must be a plain colour`).not.toContain('var(');
      }
    }
  });

  it('exposes every token ChartPanel reads', () => {
    const required = [
      '--chart-line', '--chart-line-fill', '--chart-line-fade', '--chart-bull', '--chart-bear',
      '--chart-grid', '--chart-axis', '--chart-neutral',
      '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6',
      '--text-primary', '--text-secondary', '--text-tertiary', '--surface', '--border',
    ];
    for (const token of required) {
      expect(dark, `dark is missing ${token}`).toHaveProperty(token);
      expect(light, `light is missing ${token}`).toHaveProperty(token);
    }
  });

  it('separates brand text colour from brand fill colour', () => {
    // --brand must be readable ON a surface; --brand-solid must be readable
    // UNDER white label text. In dark mode those cannot be the same colour.
    expect(dark['--brand']).not.toBe(dark['--brand-solid']);
  });
});
