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
      'functions/src/bm25/stemmer.ts',
      'functions/src/bm25/stopwords.ts',
      'functions/src/bm25/tokenizer.ts',
      'functions/src/bm25/types.ts',
      'functions/src/search/rrf.ts',
    ],
      exclude: ['src/ts/**/*.test.js'],
    },
    // R145a: CJS interop for `natural` (Porter stemmer) and `stopwords-iso`.
    // These packages are CommonJS; without `inline`, Vitest's ESM loader
    // throws on transitive imports from functions/src/bm25/*.
    server: {
      deps: {
        inline: [/^natural/, /^stopwords-iso/],
      },
    },
  },
})
