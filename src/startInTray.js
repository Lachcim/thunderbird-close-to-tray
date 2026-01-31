this.startInTray = (() => {
    const { ExtensionCommon } = (() => {
        try { return ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs"); }
        catch { return ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm"); }
    })();

    let originalCreateStateObject = null;

    function createFakeStateObject(...args) {
        const stateObject = originalCreateStateObject(...args);
        stateObject.startInTrayHiddenWindows = [];

        stateObject.windows.push = function(value) {
            // only permit one window in the vanilla list of windows
            if (this.length == 0) {
                Array.prototype.push.call(this, value);
                return;
            }

            // if the list is full, add to list of hidden windows
            stateObject.startInTrayHiddenWindows.push(value);
        };

        return stateObject;
    }

    async function hijackSessionStoreManager(context) {
        const { SessionStoreManager } = context.extension.windowManager.getAll().next().value.window;

        // create a fake state object that only remembers up to one window and hides away the rest
        if (originalCreateStateObject == null)
            originalCreateStateObject = SessionStoreManager._createStateObject;

        SessionStoreManager._createStateObject = createFakeStateObject;
    }

    function restoreSessionStoreManager(context) {
        const { SessionStoreManager } = context.extension.windowManager.getAll().next().value.window;

        // restore the original implementation of _createStateObject
        SessionStoreManager._createStateObject = originalCreateStateObject;
    }

    function restoreHiddenWindows(context, parentWindowId) {
        const { SessionStoreManager } = context.extension.windowManager.getAll().next().value.window;

        if (SessionStoreManager.store.data.startInTrayHiddenWindows.length == 0)
            return;

        // create a fake initial state
        SessionStoreManager._initialState = SessionStoreManager.store.data;
        SessionStoreManager._initialState.windows = SessionStoreManager._initialState.startInTrayHiddenWindows;

        // open hidden windows based on the fake initial state
        const parentWindow = context.extension.windowManager.get(parentWindowId, context).window;
        SessionStoreManager._openOtherRequiredWindows(parentWindow);
    }

    return class StartInTray extends ExtensionCommon.ExtensionAPI {
        getAPI(context) {
            return {
                startInTray: {
                    hijackSessionStoreManager: hijackSessionStoreManager.bind(null, context),
                    restoreSessionStoreManager: restoreSessionStoreManager.bind(null, context),
                    restoreHiddenWindows: restoreHiddenWindows.bind(null, context)
                }
            };
        }
    };
})();
