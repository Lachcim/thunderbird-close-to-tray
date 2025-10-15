function handleWindow(window) {
    // only handle main windows
    if (window.type == "normal") {
        messenger.trayOnClose.trayOnClose(window.id);
    }
}

const openWindows = await messenger.windows.getAll();
for (const window of openWindows) {
    handleWindow(window);
}

await messenger.windows.onCreated.addListener(handleWindow);
