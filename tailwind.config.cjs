/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,svelte}'],
  theme: {
    extend: {
      colors: {
        sand: '#f1e4d1',
        brick: '#8d3f2d',
        soot: '#22130f'
      },
      fontFamily: {
        display: ['Oswald', 'sans-serif'],
        body: ['"Space Grotesk"', 'sans-serif']
      }
    }
  },
  plugins: []
};
