import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const tokens = new Map([...readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')
  .matchAll(/(--[\w-]+):\s*(#[\da-f]{6})/gi)].map((match) => [match[1], match[2]]));
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selectors: match[1].trim().split(',').map((selector) => selector.trim()),
  declarations: new Map(match[2].split(';').filter((entry) => entry.includes(':')).map((entry) => {
    const separator = entry.indexOf(':');
    return [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()];
  })),
}));

function declaration(selector, property) {
  return rules.filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.declarations.get(property)).filter(Boolean).at(-1);
}

function color(value) {
  const token = value.match(/var\((--[\w-]+)\)/)?.[1];
  const hex = token ? tokens.get(token) : value.match(/#[\da-f]{6}/i)?.[0];
  assert.ok(hex, `Unsupported color: ${value}`);
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function luminance(rgb) {
  return rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(foreground, background) {
  const [dark, light] = [luminance(color(foreground)), luminance(color(background))].sort((a, b) => a - b);
  return (light + 0.05) / (dark + 0.05);
}

test('H1 editable field boundaries meet 3:1 without changing public-site fields', () => {
  for (const host of ['abar-auth-layout', 'abar-admin-layout']) {
    for (const element of ['input', 'textarea']) {
      const selector = `${host} ${element}`;
      const border = declaration(selector, 'border-color') ?? declaration('input', 'border');
      const ratio = contrast(border, 'var(--color-surface)');
      assert.ok(ratio >= 3, `${selector}: ${ratio}:1 is below 3:1`);
    }
  }
  assert.equal(declaration('input', 'border'), '1px solid var(--color-border)');
});

test('H1 keyboard focus meets 3:1 on light and header surfaces without changing public-site focus', () => {
  const original = declaration(':focus-visible', 'outline');
  const auth = declaration('abar-auth-layout :focus-visible', 'outline-color') ?? original;
  const admin = declaration('abar-admin-layout :focus-visible', 'outline-color') ?? original;
  const header = declaration('abar-admin-layout .admin-header :focus-visible', 'outline-color') ?? admin;
  for (const [name, foreground, background] of [
    ['login and password fields', auth, 'var(--color-surface)'],
    ['users', admin, 'var(--color-surface)'],
    ['admin navigation', admin, 'var(--color-surface-subtle)'],
    ['admin header', header, 'var(--color-blue-dark)'],
  ]) {
    const ratio = contrast(foreground, background);
    assert.ok(ratio >= 3, `${name}: ${ratio}:1 is below 3:1`);
  }
  assert.equal(original, '3px solid var(--color-orange)');
  assert.equal(declaration(':focus-visible', 'outline-offset'), '3px');
});
