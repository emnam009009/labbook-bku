import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Test file pattern — chạy file *.test.js trong thư mục tests/
    include: ['tests/**/*.test.js', 'tests/**/*.test.ts'],

    // Environment 'node' đủ cho utils thuần. Nếu test code touch DOM thật
    // (querySelector, document, etc.) thì đổi sang 'jsdom' và cài jsdom:
    //   npm install --save-dev jsdom
    environment: 'node',

    // Globals: false → buộc import { describe, it, expect } từ 'vitest'
    // (rõ ràng hơn, IDE autocomplete tốt hơn)
    globals: false,

    // Coverage config — chạy: npm test -- --coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
      'src/ts/utils/**/*.js',
      'functions/src/bm25/chemistry-patterns.ts',
      'functions/src/search/rrf.ts',
    ],
      exclude: ['src/ts/**/*.test.js'],
    },
  },
})
