;(function () {
  var preference = localStorage.getItem("theme-preference")
  var theme = preference !== null ? JSON.parse(preference) : "System"
  var isDark = theme === "Dark" || (theme === "System" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  if (isDark) document.documentElement.classList.add("dark")
})()
