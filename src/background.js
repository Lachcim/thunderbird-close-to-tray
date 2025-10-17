function handleWindow(window) {
    // only handle main windows
    if (window.type == "normal") {
        messenger.closeToTray.registerWindow(window.id);
    }
}

function handleFailure() {
    messenger.notifications.create(
        "closeToTrayFailed",
        {
            title: "Couldn't move Thunderbird to the tray",
            message: "Close to Tray couldn't find your tray. Are you using Windows?",
            type: "basic",
            iconUrl: "img/256.png"
        }
    );
}

// make sure addListener is called before first await to ensure it registers for non-persistent background page
messenger.windows.onCreated.addListener(handleWindow);
messenger.closeToTray.onFail.addListener(handleFailure);

const openWindows = await messenger.windows.getAll();
openWindows.forEach(handleWindow);
