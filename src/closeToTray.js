const { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");

const restorers = new Map();
const emitter = new ExtensionCommon.EventEmitter();

function getTrayService() {
    // no tray on Mac or other systems
    if (AppConstants.platform != "win" && AppConstants.platform != "linux")
        return { service: null, error: null };

    // this is Windows, tray is supported natively
    if (AppConstants.platform == "win")
        return { service: Ci.nsIMessengerWindowsIntegration, error: null };

    // this is Linux, check if tray is supported through Betterbird
    if (!Ci.nsIMessengerUnixIntegration)
        return { service: null, error: { code: "noBetterbird" } };

    // this is Betterbird on Linux, check if desktop environment is supported
    const desktopEnvironment = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).desktopEnvironment;
    const supportedDesktops = Services.prefs.getStringPref("mail.minimizeToTray.supportedDesktops");

    // Betterbird escape hatch for when desktop detection fails
    if (!desktopEnvironment && supportedDesktops.includes("no-DE"))
        return { service: Ci.nsIMessengerUnixIntegration, error: null };

    // couldn't detect the desktop environment
    if (!desktopEnvironment)
        return { service: null, error: { code: "noDesktopEnvironment" } };

    // substring not present in supportedDesktops - this is how Betterbird implements this check
    if (!supportedDesktops.includes(desktopEnvironment)) {
        return { service: null, error: { code: "unsupportedDesktopEnvironment", desktopEnvironment } };
    }

    return { service: Ci.nsIMessengerUnixIntegration, error: null };
}

function moveToTray(window, baseWindow) {
    const {service, error} = getTrayService();

    // check if system supports tray
    if (error) {
        emitter.emit("closeToTray-fail", error);
        return;
    }

    // minimize required, otherwise the window will be restored (un-maximized) when the tray icon is clicked
    window.minimize();

    // no tray on this system, just minimize
    if (!service)
        return;

    // if mail.minimizeToTray is enabled, let it handle the hiding
    if (Services.prefs.getBoolPref("mail.minimizeToTray", false))
        return;

    Cc["@mozilla.org/messenger/osintegration;1"].getService(service).hideWindow(baseWindow);
}

function registerWindow(context, windowId) {
    if (restorers.has(windowId))
        return;

    const window = context.extension.windowManager.get(windowId, context).window;
    const baseWindow = window.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow);
    const closeWindow = window.close;

    function handleClose(event) {
        // only hide Thunderbird when there are no other main windows
        if (restorers.size > 1) {
            restorers.delete(windowId);

            closeWindow();
            return;
        }

        event?.preventDefault();
        moveToTray(window, baseWindow);
    }

    // handle close from taskbar
    window.addEventListener("close", handleClose);

    // handle close from X button
    window.close = handleClose;

    restorers.set(windowId, () => {
        window.close = closeWindow;
        window.removeEventListener("close", handleClose);
    });
}

class CloseToTray extends ExtensionCommon.ExtensionAPIPersistent {
    PERSISTENT_EVENTS = {
        onFail: ({ fire }) => {
            const listener = async (_, error) => {
                await fire.wakeup?.();
                fire.async(error);
            };

            emitter.on("closeToTray-fail", listener);
            return {
                unregister: () => { emitter.off("closeToTray-fail", listener); },
                convert: newFire => { fire = newFire; },
            };
        }
    };

    getAPI(context) {
        const onFail = new ExtensionCommon.EventManager({
            context,
            module: "closeToTray",
            event: "onFail",
            extensionApi: this
        }).api();

        return {
            closeToTray: {
                registerWindow: registerWindow.bind(null, context),
                onFail
            }
        };
    }

    onShutdown() {
        restorers.forEach(restore => restore());
        restorers.clear();
    }
};

this.closeToTray = CloseToTray;
