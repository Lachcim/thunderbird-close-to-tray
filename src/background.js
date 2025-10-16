function handleWindow(window) {
    // only handle main windows
    if (window.type == "normal") {
        messenger.closeToTray.closeToTray(window.id);
    }
}

const openWindows = await messenger.windows.getAll();
openWindows.forEach(handleWindow);

await messenger.windows.onCreated.addListener(handleWindow);
