window.addEventListener("load", () => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");

    Array.from(document.getElementsByClassName(code)).forEach(element => element.hidden = false);

    Array.from(document.getElementsByClassName("close")).forEach(
        button => button.addEventListener("click", async () => {
            // window.close doesn't work on old Thunderbird versions despite allowScriptsToClose
            const window = await browser.windows.getCurrent();
            browser.windows.remove(window.id);
        })
    );

    document.getElementById("version").innerText = params.get("version");
    document.getElementById("desktopEnvironment").innerText = params.get("desktopEnvironment");
});
