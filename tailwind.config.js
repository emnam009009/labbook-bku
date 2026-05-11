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
        // ── Primary brand — Electric Cyan ─────────────────────
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          active: 'var(--primary-active)',
          light: 'var(--primary-light)',
          bg: 'var(--primary-bg)',
        },
        // ── Sidebar — Slate 900 ───────────────────────────────
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          2: 'var(--sidebar-2)',
          3: 'var(--sidebar-3)',
        },
        // ── Surface ───────────────────────────────────────────
        surface: {
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        // ── Border ────────────────────────────────────────────
        border: {
          DEFAULT: 'var(--border)',
          2: 'var(--border-2)',
        },
        // ── Text ──────────────────────────────────────────────
        'lab-text': {
          DEFAULT: 'var(--text)',
          2: 'var(--text-2)',
          3: 'var(--text-3)',
        },
        // ── Status ────────────────────────────────────────────
        success: {
          DEFAULT: 'var(--success)',
          bg: 'var(--cds-support-success-bg)',
          border: 'var(--cds-support-success-border)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          bg: 'var(--cds-support-warning-bg)',
          border: 'var(--cds-support-warning-border)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          bg: 'var(--cds-support-error-bg)',
          border: 'var(--cds-support-error-border)',
        },
        info: {
          DEFAULT: 'var(--info)',
          bg: 'var(--cds-support-info-bg)',
          border: 'var(--cds-support-info-border)',
        },
        // ── Gold (kept for backward-compat, used in toolkit/workbench) ─
        gold: {
          DEFAULT: 'var(--warn)',
          2: '#fbbf24',
          bg: 'var(--cds-support-warning-bg)',
        },
        // ═══════════════════════════════════════════════════════
        // DEPRECATED ALIASES — backward-compat (remove R158b-p6)
        // ═══════════════════════════════════════════════════════
        teal: {
          DEFAULT: 'var(--primary)',
          2: 'var(--primary-hover)',
          3: '#38BDF8',
          4: '#7DD3FC',
          light: 'var(--primary-light)',
          'bg': 'var(--primary-bg)',
        },
        navy: {
          DEFAULT: 'var(--sidebar)',
          2: 'var(--sidebar-2)',
          3: 'var(--sidebar-3)',
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
