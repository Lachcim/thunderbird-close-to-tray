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
    Array.from(document.getElementsByClassName("uninstall")).forEach(
        button => button.addEventListener("click", () => {
            browser.management.uninstallSelf();
        })
    );
    Array.from(document.getElementsByClassName("sunsetAcknowledged")).forEach(
        button => button.addEventListener("click", async () => {
            const storage = await browser.storage.local.get("status");
            const status = storage.status ?? {};

            status.sunsetAcknowledged = true;
            await browser.storage.local.set({ status });
        })
    );
    /* beginBetterbird */
    Array.from(document.getElementsByClassName("version")).forEach(
        node => node.innerText = params.get("version")
    );
    Array.from(document.getElementsByClassName("desktopEnvironment")).forEach(
        node => node.innerText = params.get("desktopEnvironment")
    );
    /* endBetterbird */
    Array.from(document.getElementsByClassName("migrated")).forEach(
        node => node.hidden = params.get("migrated") == "false"
    );

    Array.from(document.querySelectorAll("[hidden]")).forEach(element => element.remove());
});
