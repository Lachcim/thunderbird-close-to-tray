async function handleStartup() {
    const window = await browser.windows.getCurrent();

    // only handle main windows
    if (window.type == "normal") {
        messenger.closeToTray.moveToTray(window.id);
    }
}

browser.runtime.onStartup.addListener(handleStartup);
