const { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");

const activeWindows = new Set();

function registerWindow(context, windowId) {
    if (activeWindows.has(windowId))
        return;

    const window = context.extension.windowManager.get(windowId, context).window;
    const baseWindow = window.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow);

    function handleClose(event) {
        // only hide Thunderbird when there are no other main windows
        if (activeWindows.size > 1) {
            activeWindows.delete(windowId);

            window.closeToTrayClose();
            return;
        }

        event?.preventDefault();

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
    window.closeToTrayClose = window.close;
    window.close = handleClose;

    activeWindows.add(windowId);
}

class CloseToTray extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
        return {
            closeToTray: {
                registerWindow: registerWindow.bind(null, context)
            }
        };
    }
};

this.closeToTray = CloseToTray;
