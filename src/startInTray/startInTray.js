this.startInTray = (() => {
    const { ExtensionCommon } = (() => {
        try { return ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs"); }
        catch { return ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm"); }
    })();

    const savedWindows = [];

    function saveWindow(context, windowId) {
        const window = context.extension.windowManager.get(windowId).window;

        if (!window || window.document.readyState != "complete" || !window.getWindowStateForSessionPersistence)
            return;

        savedWindows.push(window.getWindowStateForSessionPersistence());
    }

    function restoreWindows() {

    }

    return class StartInTray extends ExtensionCommon.ExtensionAPI {
        getAPI(context) {
            return {
                startInTray: {
                    saveWindow: saveWindow.bind(null, context),
                    restoreWindows
                }
            };
        }
    };
})();
