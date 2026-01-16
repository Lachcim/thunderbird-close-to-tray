function handleWindow(window) {
    // only handle main windows
    if (window.type == "normal") {
        messenger.closeToTray.registerWindow(window.id);
    }
}

messenger.windows.onCreated.addListener(handleWindow);
messenger.windows.getAll().then(openWindows => openWindows.forEach(handleWindow));
