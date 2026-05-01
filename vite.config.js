import { defineConfig } from 'vite'

export default defineConfig({
  // Thư mục gốc chứa index.html
  root: '.',

  // Cấu hình build output
  build: {
    outDir: 'dist',
    // Tách CSS riêng để cache tốt hơn
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Đặt tên file có hash để browser cache đúng
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },

  // Dev server
  server: {
    port: 3000,
    open: true, // Tự mở trình duyệt khi chạy npm run dev
  },
})
