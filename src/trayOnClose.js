const { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");

class TrayOnClose extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
        async function trayOnClose(windowId) {
            const window = context.extension.windowManager.get(windowId, context).window;
            const baseWindow = window.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow);

            function handleClose(event) {
                event?.preventDefault();

                // minimize required, otherwise the window will be restored (un-maximized) when the tray icon is clicked
                window.minimize();

                Cc["@mozilla.org/messenger/osintegration;1"].getService(Ci.nsIMessengerWindowsIntegration).hideWindow(baseWindow);
            }

            window.addEventListener("close", handleClose); // handle close from taskbar
            window.close = handleClose; // handle close from X button
        }

        return {
            trayOnClose: { trayOnClose }
        };
    }
};

this.trayOnClose = TrayOnClose;
