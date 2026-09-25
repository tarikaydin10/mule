import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works from any path (domain root or subfolder).
  base: './',
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Phaser rarely changes, game code often: a separate chunk keeps Phaser cached across deploys.
          groups: [{ name: 'phaser', test: /node_modules[\\/]phaser[\\/]/ }],
        },
      },
    },
    // Phaser alone is ~1.4 MB minified; the default 500 kB warning is noise here.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
