window.addEventListener("load", async () => {
    const storage = await browser.storage.local.get("options");
    const options = storage.options ?? { startInTray: false };

    const startInTrayCheckbox = document.getElementById("start-in-tray");

    startInTrayCheckbox.checked = options.startInTray;
    startInTrayCheckbox.addEventListener("change", async () => {
        options.startInTray = startInTrayCheckbox.checked;
        await browser.storage.local.set({ options });
    });
});
