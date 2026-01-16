this.startInTray = (() => {
    const { ExtensionCommon } = (() => {
        try { return ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs"); }
        catch { return ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm"); }
    })();
    const { SessionStoreManager } = (() => {
        try { return ChromeUtils.importESModule("resource://gre/modules/SessionStoreManager.sys.mjs"); }
        catch { return ChromeUtils.import("resource://gre/modules/SessionStoreManager.jsm"); }
    })();

    const savedWindows = [];

    function saveWindow(context, windowId) {
        const window = context.extension.windowManager.get(windowId).window;

        if (window && window.document.readyState == "complete" || window.getWindowStateForSessionPersistence)
            savedWindows.push(window.getWindowStateForSessionPersistence());
    }

    function restoreWindows(context, parentWindowId) {
        if (!SessionStoreManager._initialState)
            SessionStoreManager._initialState = SessionStoreManager._createStateObject();

        SessionStoreManager._initialState.windows.push(...savedWindows);
        savedWindows.splice(0);

        const parentWindow = context.extension.windowManager.get(parentWindowId).window;
        SessionStoreManager._openOtherRequiredWindows(parentWindow);
    }

    return class StartInTray extends ExtensionCommon.ExtensionAPI {
        getAPI(context) {
            return {
                startInTray: {
                    saveWindow: saveWindow.bind(null, context),
                    restoreWindows: restoreWindows.bind(null, context)
                }
            };
        }
    };
})();
