window.addEventListener("load", async () => {
    const storage = await browser.storage.local.get("options");
    const options = storage.options ?? { startInTray: false };

    const startInTrayCheckbox = document.getElementById("start-in-tray");

    startInTrayCheckbox.checked = options.startInTray;
    startInTrayCheckbox.addEventListener("change", async () => {
        options.startInTray = startInTrayCheckbox.checked;
        await browser.storage.local.set({ options });

        // can't use browser.storage.local.onChanged on Thunderbird 76
        const messenger = browser.extension.getBackgroundPage().messenger;
        if (options.startInTray) messenger.startInTray.hijackSessionStoreManager();
        else messenger.startInTray.restoreSessionStoreManager();
    });

    // macOS-specific options
    const platformInfo = await browser.runtime.getPlatformInfo();
    if (platformInfo.os === "mac") {
        document.getElementById("mac-options").hidden = false;

        const minimizeRadio = document.getElementById("mac-minimize");
        const hideRadio = document.getElementById("mac-hide");

        if (options.macCloseBehavior === "hide") hideRadio.checked = true;
        else minimizeRadio.checked = true;

        const handleRadioChange = async () => {
            options.macCloseBehavior = hideRadio.checked ? "hide" : "minimize";
            await browser.storage.local.set({ options });
        };

        minimizeRadio.addEventListener("change", handleRadioChange);
        hideRadio.addEventListener("change", handleRadioChange);
    }
});
