let parentWindowId = null;

function handleWindow(window) {
    // only handle main windows
    if (window.type == "normal") {
        messenger.closeToTray.registerWindow(window.id);
    }
}

async function handleStartup() {
    // check if start in tray is enabled
    const storage = await browser.storage.local.get("options");
    if (!storage.options?.startInTray)
        return;

    // prevent multiple windows from being opened next time Thunderbird launches
    messenger.startInTray.hijackSessionStoreManager();

    const windows = await browser.windows.getAll();

    // there is a popup that the user should see, abort
    if (windows.some(window => window.type != "normal"))
        return;

    // Start in tray is enabled but Thunderbird started with multiple windows open.
    // This should not normally happen unless the session file has been tampered with
    for (let i = 1; i < windows.length; i++) {
        browser.windows.remove(windows[i].id);
    }

    // hide the main window
    messenger.closeToTray.moveToTray(windows[0].id);
    parentWindowId = windows[0].id;

    // restore the main window when the tray icon is clicked
    browser.windows.onFocusChanged.addListener(handleRestore);
}

function handleRestore(windowId) {
    if (windowId != parentWindowId)
        return;

    // open the remaining windows
    messenger.startInTray.restoreHiddenWindows(parentWindowId);

    browser.windows.onFocusChanged.removeListener(handleRestore);
}

function handleStorage(changes) {
    const startInTray = changes.options?.newValue?.startInTray;
    if (startInTray == null)
        return;

    if (startInTray) messenger.startInTray.hijackSessionStoreManager();
    else messenger.startInTray.restoreSessionStoreManager();
}

messenger.windows.onCreated.addListener(handleWindow);
messenger.windows.getAll().then(openWindows => openWindows.forEach(handleWindow));

browser.runtime.onStartup.addListener(handleStartup);
browser.storage.local.onChanged.addListener(handleStorage);
