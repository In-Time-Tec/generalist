;(function () {
  const preference = localStorage.getItem("theme-preference")
  let theme = "System"
  if (preference === '"Dark"') theme = "Dark"
  if (preference === '"Light"') theme = "Light"
  const isDark = theme === "Dark" || (theme === "System" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  if (isDark) document.documentElement.classList.add("dark")
})()
