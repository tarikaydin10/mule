import { describe, expect, it } from 'vitest';

// Raw source of every module in src/systems, inlined by Vite at test time.
const sources = import.meta.glob<string>('./**/*.ts', { query: '?raw', import: 'default', eager: true });

// Matches `from 'phaser'`, `import 'phaser'`, `import('phaser')` and `require('phaser')`, incl. subpaths.
const PHASER_IMPORT = /\b(?:from|import|require)\s*\(?\s*['"]phaser(?:\/[^'"]*)?['"]/;

describe('src/systems', () => {
  it('does not import Phaser, so game logic stays testable without a renderer', () => {
    const offenders = Object.entries(sources)
      .filter(([, source]) => PHASER_IMPORT.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
