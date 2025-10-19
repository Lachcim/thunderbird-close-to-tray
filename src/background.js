function handleWindow(window) {
    // only handle main windows
    if (window.type == "normal") {
        messenger.closeToTray.registerWindow(window.id);
    }
}

function handleFailure(error) {
    const getDiagnostic = () => {
        if (error.code == "noBetterbird")
            return "Thunderbird on Linux lacks tray support. Consider using Betterbird instead.";
        if (error.code == "oldBetterbird")
            return "This version of Betterbird is not supported. Please update Betterbird to version 102.15.1 or newer.";
        if (error.code == "noDesktopEnvironment")
            return "Couldn't detect your desktop environment.";
        if (error.code == "unsupportedDesktopEnvironment")
            return `Your desktop environment ("${error.desktopEnvironment}") is not supported. Try adjusting mail.minimizeToTray.supportedDesktops.`;

        return "";
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

messenger.windows.onCreated.addListener(handleWindow);
messenger.closeToTray.onFail.addListener(handleFailure);

messenger.windows.getAll().then(openWindows => openWindows.forEach(handleWindow));
