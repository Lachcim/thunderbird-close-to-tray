async function handleStartup() {
    const windows = await browser.windows.getAll();

    // there is a popup that the user should see, abort
    if (windows.some(window => window.type != "normal"))
        return;

    // can't hide multiple windows behind one icon, close extra windows and restore them later
    for (let i = 1; i < windows.length; i++) {
        await messenger.startInTray.saveWindow(windows[i].id);
        browser.windows.remove(windows[i].id);
    }

    messenger.closeToTray.moveToTray(windows[0].id);
}

browser.runtime.onStartup.addListener(handleStartup);
