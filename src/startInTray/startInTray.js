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
        originalCreateStateObject = SessionStoreManager._createStateObject;
        SessionStoreManager._createStateObject = createFakeStateObject;

        // install and populate fake state object
        const fakeStateObject = SessionStoreManager._createStateObject();

        await SessionStoreManager.store.load();
        const realStoreWindows = SessionStoreManager.store.data.windows ?? [];
        const realStoreHiddenWindows = SessionStoreManager.store.data.startInTrayHiddenWindows ?? [];

        if (realStoreHiddenWindows)
            fakeStateObject.startInTrayHiddenWindows = realStoreHiddenWindows;

        for (let i = 1; i < realStoreWindows.length; i++)
            fakeStateObject.windows.push(realStoreWindows[i]);

        SessionStoreManager.store.data = fakeStateObject;
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
                    restoreHiddenWindows: restoreHiddenWindows.bind(null, context)
                }
            };
        }
    };
})();
