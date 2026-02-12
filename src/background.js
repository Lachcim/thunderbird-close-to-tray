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

// macOS: apply close behavior preference from storage
async function applyMacCloseBehavior() {
    const storage = await browser.storage.local.get("options");
    messenger.closeToTray.setMacCloseBehavior(
        storage.options?.macCloseBehavior ?? "minimize"
    );
}
applyMacCloseBehavior();

// macOS: sync preference changes immediately
browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.options) {
        const behavior = changes.options.newValue?.macCloseBehavior ?? "minimize";
        messenger.closeToTray.setMacCloseBehavior(behavior);
    }
});

// macOS: restore hidden windows when user clicks Dock icon
let macWindowsHidden = false;

messenger.closeToTray.onMacHidden.addListener(() => {
    macWindowsHidden = true;
    browser.windows.onFocusChanged.addListener(handleMacRestore);
    browser.windows.onCreated.addListener(handleMacNewWindow);
});

function handleMacRestore(windowId) {
    if (!macWindowsHidden) return;
    if (windowId === browser.windows.WINDOW_ID_NONE) return;

    macWindowsHidden = false;
    messenger.closeToTray.restoreHiddenMacWindows();
    browser.windows.onFocusChanged.removeListener(handleMacRestore);
    browser.windows.onCreated.removeListener(handleMacNewWindow);
}

async function handleMacNewWindow(newWindow) {
    if (!macWindowsHidden) return;

    macWindowsHidden = false;
    messenger.closeToTray.restoreHiddenMacWindows();

    // close the spurious window opened by Gecko's ReOpen()
    try { await browser.windows.remove(newWindow.id); }
    catch (e) { /* window may have already been closed */ }

    browser.windows.onFocusChanged.removeListener(handleMacRestore);
    browser.windows.onCreated.removeListener(handleMacNewWindow);
}

messenger.windows.onCreated.addListener(handleWindow);
messenger.windows.getAll().then(openWindows => openWindows.forEach(handleWindow));

browser.runtime.onStartup.addListener(handleStartup);
