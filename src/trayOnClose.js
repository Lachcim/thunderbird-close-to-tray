const { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");

class TrayOnClose extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
        async function trayOnClose(windowId) {
            const window = context.extension.windowManager.get(windowId, context).window;
            const baseWindow = window.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow);

            window.close = () => {
                Cc["@mozilla.org/messenger/osintegration;1"].getService(Ci.nsIMessengerWindowsIntegration).hideWindow(baseWindow);
            };
        }

        return {
            trayOnClose: {
                trayOnClose
            }
        };
    }
};

this.trayOnClose = TrayOnClose;
