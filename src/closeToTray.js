const { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");

const restorers = new Map();
const emitter = new ExtensionCommon.EventEmitter();

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

        // check if system supports tray
        if (!Ci.nsIMessengerWindowsIntegration) {
            emitter.emit("closeToTray-fail");
            return;
        }

        // minimize required, otherwise the window will be restored (un-maximized) when the tray icon is clicked
        window.minimize();

        // if mail.minimizeToTray is enabled, let it handle the hiding
        if (Services.prefs.getBoolPref("mail.minimizeToTray", false))
            return;

        Cc["@mozilla.org/messenger/osintegration;1"].getService(Ci.nsIMessengerWindowsIntegration).hideWindow(baseWindow);
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
            const listener = async () => {
                await fire.wakeup?.();
                fire.async();
            };

            emitter.on("closeToTray-fail", listener);
            return {
                unregister: () => { emitter.off("closeToTray-fail", listener); },
                convert: newFire => { fire = newFire; },
            };
        }
    }

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
