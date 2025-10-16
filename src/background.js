function handleWindow(window) {
    // only handle main windows
    if (window.type == "normal") {
        messenger.closeToTray.registerWindow(window.id);
    }
}

// make sure addListener is called before first await to ensure it registers for non-persistent background page
messenger.windows.onCreated.addListener(handleWindow);

const openWindows = await messenger.windows.getAll();
openWindows.forEach(handleWindow);
