/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        rock: {
          50: "#f0fdf4",
          500: "#22c55e",
          600: "#16a34a",
        },
      },
    },
  },
  plugins: [],
};
