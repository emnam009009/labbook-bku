import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Thư mục gốc chứa index.html
  root: '.',

  plugins: [
    VitePWA({
      // Auto update khi deploy version mới (không hỏi user, reload nhẹ)
      registerType: 'autoUpdate',

      // Auto inject script đăng ký SW vào index.html (không cần code thủ công)
      injectRegister: false,  // Defer SW registration to after window.load (perf)

      // Dùng manifest.json hiện có trong public/ - không generate đè
      manifest: false,

      // Strategy generate SW (mặc định 'generateSW' qua Workbox)
      strategies: 'generateSW',

      // Tên file SW output (đặt /sw.js để giữ scope tương thích manifest cũ)
      filename: 'sw.js',

      workbox: {
        // Precache mọi static asset Vite generate (JS/CSS hash) + fonts + icons
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,woff2}'
        ],

        // Bỏ qua sourcemap, file lớn không cần precache
        globIgnores: [
          '**/node_modules/**',
          '**/*.map'
        ],

        // SPA fallback: mọi route 404 → trả index.html (cho client-side routing)
        navigateFallback: 'index.html',

        // Allowlist: chỉ apply navigateFallback cho navigation requests
        navigateFallbackAllowlist: [/^(?!\/__).*/],

        // Loại trừ Firebase Auth khỏi navigation fallback (để fetch thẳng API)
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/__\/auth\//,
        ],

        // Khi deploy version mới, xóa cache cũ tránh bloat storage
        cleanupOutdatedCaches: true,

        // Cho phép SW kiểm soát ngay từ lần load đầu (skip waiting period)
        skipWaiting: true,
        clientsClaim: true,

        // Tăng max file size precache (mặc định 2MB) - vì pdfmake chunk to
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,

        // Runtime cache strategies cho các request không precache
        runtimeCaching: [
          {
            // Firebase Auth REST: network-first với timeout, fallback cache
            urlPattern: /^https:\/\/(identitytoolkit|securetoken)\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firebase-auth-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // Firebase Realtime DB REST endpoint (websocket KHÔNG đi qua đây)
            urlPattern: /^https:\/\/.*\.firebaseio\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firebase-db-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 5 * 60, // 5 minutes (data ngắn hạn)
              },
              networkTimeoutSeconds: 5,
            },
          },
          {
            // Google Fonts API (nếu user dùng feature load thêm font sau này)
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
            },
          },
        ],
      },

      // Dev mode: enable SW để test offline trên dev server
      devOptions: {
        enabled: false, // Tắt mặc định - bật khi cần debug SW dev
        type: 'module',
      },
    }),
  ],

  // Cấu hình build output
  build: {
    outDir: 'dist',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },

  server: {
    port: 3000,
    open: true,
  },
})
