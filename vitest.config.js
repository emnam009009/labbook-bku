import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/ts'),
      '@/shared': path.resolve(__dirname, './src/ts/shared'),
      '@/domains': path.resolve(__dirname, './src/ts/domains'),
    },
  },
  test: {
    include: ['tests/**/*.test.js', 'tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
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
        'src/ts/domains/materials/service.ts',
        'src/ts/domains/samples/service.ts',
        'src/ts/domains/experiments/service.ts',
      ],
      exclude: ['src/ts/**/*.test.js'],
    },
    server: {
      deps: {
        inline: [/^natural/, /^stopwords-iso/],
      },
    },
  },
})
