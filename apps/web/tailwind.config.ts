import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: { extend: { colors: { marca: { DEFAULT: '#0e7490', escuro: '#155e75' } } } },
  plugins: [],
};
export default config;
