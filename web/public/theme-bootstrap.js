try {
    var storedTheme = JSON.parse(localStorage.getItem("infinite-canvas:theme_store") || "{}");
    var initialTheme = storedTheme.state && storedTheme.state.theme === "light" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", initialTheme === "dark");
    document.documentElement.style.colorScheme = initialTheme;
} catch (error) {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
}
