/**
 * Theme Contrast Checker
 *
 * A simple script to verify that text is visible against backgrounds
 * in both light and dark modes.
 *
 * Usage: npx tsx tests/contrast-check.ts
 */

const CSS_VARS = {
  light: {
    background: '0 0% 100%',      // #ffffff
    foreground: '222 47% 11%',     // #0f172a
    card: '210 40% 98%',           // #f8fafc
    primary: '239 84% 67%',        // #6366f1
    muted: '210 40% 96%',          // #f1f5f9
    mutedForeground: '215 16% 47%', // #64748b
    border: '214 32% 91%',         // #e2e8f0
  },
  dark: {
    background: '222 47% 11%',     // #0f172a
    foreground: '210 40% 98%',     // #f8fafc
    card: '217 33% 17%',           // #1e293b
    primary: '239 84% 67%',        // #6366f1
    muted: '215 25% 27%',          // #475569
    mutedForeground: '215 20% 65%', // #94a3b8
    border: '215 20% 27%',         // #334155
  }
};

/**
 * Convert HSL values to RGB
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}

/**
 * Calculate relative luminance
 */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c =>
    c / 255 <= 0.03928 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 */
function getContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse HSL string "H S% L%" to values
 */
function parseHsl(hslStr: string): [number, number, number] {
  const parts = hslStr.trim().split(/\s+/);
  return [
    parseFloat(parts[0]),
    parseFloat(parts[1].replace('%', '')),
    parseFloat(parts[2].replace('%', ''))
  ];
}

/**
 * Check contrast for a mode
 */
function checkMode(mode: 'light' | 'dark') {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${mode.toUpperCase()} MODE`);
  console.log('='.repeat(50));

  const vars = CSS_VARS[mode];
  const results: { pair: string; ratio: number; passes: boolean }[] = [];

  // Check text on background
  const bgHsl = parseHsl(vars.background);
  const fgHsl = parseHsl(vars.foreground);
  const bgRgb = hslToRgb(...bgHsl);
  const fgRgb = hslToRgb(...fgHsl);
  const bgLum = getLuminance(...bgRgb);
  const fgLum = getLuminance(...fgRgb);
  const ratio = getContrastRatio(bgLum, fgLum);

  results.push({
    pair: 'foreground on background',
    ratio,
    passes: ratio >= 4.5
  });

  // Check muted text on background
  const mutedFgHsl = parseHsl(vars.mutedForeground);
  const mutedFgRgb = hslToRgb(...mutedFgHsl);
  const mutedFgLum = getLuminance(...mutedFgRgb);
  const mutedRatio = getContrastRatio(bgLum, mutedFgLum);

  results.push({
    pair: 'muted-foreground on background',
    ratio: mutedRatio,
    passes: mutedRatio >= 3 // AA for large text
  });

  // Check text on card
  const cardHsl = parseHsl(vars.card);
  const cardRgb = hslToRgb(...cardHsl);
  const cardLum = getLuminance(...cardRgb);
  const cardRatio = getContrastRatio(cardLum, fgLum);

  results.push({
    pair: 'foreground on card',
    ratio: cardRatio,
    passes: cardRatio >= 4.5
  });

  // Print results
  console.log('\nContrast Ratios:');
  console.log('-'.repeat(50));

  let allPass = true;
  for (const result of results) {
    const status = result.passes ? '✅ PASS' : '❌ FAIL';
    console.log(`${result.pair}: ${result.ratio.toFixed(2)}:1 ${status}`);
    if (!result.passes) allPass = false;
  }

  console.log('\nWCAG Guidelines:');
  console.log('  - AA Normal Text: 4.5:1');
  console.log('  - AA Large Text: 3:1');
  console.log('  - AAA Normal Text: 7:1');

  return allPass;
}

// Run checks
console.log('\n🎨 Theme Contrast Checker');
console.log('========================\n');

const lightPass = checkMode('light');
const darkPass = checkMode('dark');

console.log('\n' + '='.repeat(50));
console.log('SUMMARY');
console.log('='.repeat(50));
console.log(`Light Mode: ${lightPass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Dark Mode: ${darkPass ? '✅ PASS' : '❌ FAIL'}`);

if (lightPass && darkPass) {
  console.log('\n✅ All contrast checks passed!');
  process.exit(0);
} else {
  console.log('\n❌ Some contrast checks failed!');
  process.exit(1);
}
