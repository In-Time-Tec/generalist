;(function () {
  const preference = localStorage.getItem("theme-preference")
  const theme = preference !== null ? JSON.parse(preference) : "System"
  const isDark = theme === "Dark" || (theme === "System" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  if (isDark) document.documentElement.classList.add("dark")
})()
