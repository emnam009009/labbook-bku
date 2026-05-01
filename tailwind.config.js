/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,html,css}',
  ],

  safelist: [
    'filter-btn', 'filter-btn.active', 'active',
    // Teal/mint palette
    'bg-teal', 'bg-teal-2', 'bg-teal-3', 'bg-teal-light',
    'text-teal', 'text-teal-2', 'border-teal',
    // Surface
    'bg-surface', 'bg-surface-2', 'bg-surface-3',
    // Border
    'border-border', 'border-border-2',
    // Text
    'text-lab-text', 'text-lab-text-2', 'text-lab-text-3',
    // Status
    'bg-success-bg', 'text-success', 'border-success-border',
    'bg-warn-bg', 'text-warn', 'border-warn-border',
    'bg-danger-bg', 'text-danger', 'border-danger-border',
    'bg-info-bg', 'text-info', 'border-info-border',
    // Layout
    'rounded-lab', 'rounded-lab-lg', 'rounded-lab-xl',
    'shadow-card', 'shadow-modal', 'shadow-toast',
    // Animation
    'animate-fade-in', 'animate-slide-up', 'animate-spin-slow',
    // Navy (sidebar)
    'bg-navy', 'bg-navy-2', 'bg-navy-3',
    // Gold
    'bg-gold', 'text-gold',
    // Misc
    'accent-teal',
  ],

  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
      colors: {
        // Sidebar
        navy: {
          DEFAULT: '#1a2332',
          2: '#151c28',
          3: '#0f1520',
        },
        // Primary teal/mint
        teal: {
          DEFAULT: '#0d9488',
          2: '#14b8a6',
          3: '#2dd4bf',
          4: '#99f6e4',
          light: '#f0fdfa',
          'bg': '#ccfbf1',
        },
        // Surface
        surface: {
          DEFAULT: '#ffffff',
          2: '#f8fafc',
          3: '#f1f5f9',
        },
        // Border
        border: {
          DEFAULT: '#e2e8f0',
          2: '#cbd5e1',
        },
        // Text
        'lab-text': {
          DEFAULT: '#0f172a',
          2: '#475569',
          3: '#94a3b8',
        },
        // Gold
        gold: {
          DEFAULT: '#f59e0b',
          2: '#fbbf24',
          bg: '#fffbeb',
        },
        // Status
        success: {
          DEFAULT: '#10b981',
          bg: '#f0fdf4',
          border: '#a7f3d0',
        },
        warn: {
          DEFAULT: '#f59e0b',
          bg: '#fffbeb',
          border: '#fde68a',
        },
        danger: {
          DEFAULT: '#ef4444',
          bg: '#fef2f2',
          border: '#fecaca',
        },
        info: {
          DEFAULT: '#3b82f6',
          bg: '#eff6ff',
          border: '#bfdbfe',
        },
      },
      borderRadius: {
        lab: '8px',
        'lab-lg': '12px',
        'lab-xl': '16px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08)',
        modal: '0 20px 60px rgba(0,0,0,0.15)',
        toast: '0 8px 24px rgba(0,0,0,0.12)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        slideUp: {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'none', opacity: '1' },
        },
        rowPop: {
          '0%': { background: 'rgba(13,148,136,0.1)' },
          '100%': { background: 'transparent' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.18s ease',
        'slide-up': 'slideUp 0.22s cubic-bezier(.4,0,.2,1)',
        'spin-slow': 'spin 0.8s linear infinite',
        'row-pop': 'rowPop 0.4s ease-out',
      },
    },
  },

  plugins: [],
}
