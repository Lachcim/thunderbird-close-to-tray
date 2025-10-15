const { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");

class TrayOnClose extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
        async function trayOnClose(windowId) {
            const window = context.extension.windowManager.get(windowId, context).window;
            window.close = () => {
                console.log("close prevented");
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
