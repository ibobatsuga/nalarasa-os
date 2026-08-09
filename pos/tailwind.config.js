/** Shares the Nalarasa OS palette; the till leans on larger touch targets. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 50: '#eef2f8', 100: '#dbe4f0', 200: '#b8c8e0', 500: '#2b5391', 600: '#1f4179', 700: '#17376b', 800: '#122c56', 900: '#0d2040' },
        leaf: { 100: '#e8f2d9', 400: '#a3c644', 500: '#8db63a', 600: '#3f9142', 700: '#2f7533' },
        amber: { 500: '#f28c28' },
        brick: { 500: '#e03131' },
        ink: { 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155' },
        line: '#e8ecf2',
        canvas: '#f7f9fc',
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
    },
  },
  plugins: [],
};
