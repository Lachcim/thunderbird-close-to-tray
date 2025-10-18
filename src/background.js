function handleWindow(window) {
    // only handle main windows
    if (window.type == "normal") {
        messenger.closeToTray.registerWindow(window.id);
    }
}

function handleFailure(error) {
    function getDiagnostic() {
        if (error.code == "noBetterbird")
            return "Thunderbird on Linux lacks tray support. Consider using Betterbird instead.";
        if (error.code == "noDesktopEnvironment")
            return "Couldn't identify your desktop environment.";
        if (error.code == "unsupportedDesktopEnvironment")
            return `Your desktop environment ("${error.desktopEnvironment}") is unsupported. Try adjusting mail.minimizeToTray.supportedDesktops.`;

        return null;
    }

    messenger.notifications.create(
        "closeToTrayFailed",
        {
            title: "Couldn't move Thunderbird to the tray",
            message: getDiagnostic(),
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
