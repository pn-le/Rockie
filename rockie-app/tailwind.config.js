/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "#0A0A0A",
        surface: "#141414",
        elevated: "#1E1E1E",
        border: "#222222",
        orange: "#FF5C00",
        blue: "#2979FF",
        cyan: "#00E5FF",
        success: "#00C853",
        danger: "#FF1744",
        primary: "#F5F0E8",
        muted: "#888888",
      },
    },
  },
  plugins: [],
};
