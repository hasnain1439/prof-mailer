// Shared by the server layout (pre-paint script) and the client ThemeToggle.
export const THEME_STORAGE_KEY = "theme";

/** Inline, pre-paint script (rendered in <head>) so the saved theme is applied before first paint. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
