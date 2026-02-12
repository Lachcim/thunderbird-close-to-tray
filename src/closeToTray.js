this.closeToTray = (() => {
    // ExtensionCommon migrated from JSM to ESM
    const { ExtensionCommon } = (() => {
        try { return ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs"); }
        catch { return ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm"); }
    })();

    // the Services global is not available on old versions of Thunderbird
    const preferences = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService);
    const appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
    const gfxInfo = Cc["@mozilla.org/gfx/info;1"].getService(Ci.nsIGfxInfo);

    const restorers = new Map();
    const emitter = new ExtensionCommon.EventEmitter();

    let macCloseBehavior = "minimize"; // "hide" or "minimize"

    // call [NSApp hide:nil] via Objective-C runtime to use the native macOS
    // app hiding mechanism; Dock click triggers applicationShouldHandleReopen
    // which Gecko handles automatically to restore windows
    function hideAppNatively() {
        const { ctypes } = (() => {
            try { return ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs"); }
            catch { return ChromeUtils.import("resource://gre/modules/ctypes.jsm"); }
        })();

        const objc = ctypes.open("/usr/lib/libobjc.A.dylib");
        try {
            const id = ctypes.voidptr_t;
            const SEL = ctypes.voidptr_t;
            // objc_msgSend needs separate declarations per signature
            const objc_msgSend = objc.declare("objc_msgSend", ctypes.default_abi, id, id, SEL);
            const objc_msgSend_id = objc.declare("objc_msgSend", ctypes.default_abi, ctypes.void_t, id, SEL, id);
            const sel_registerName = objc.declare("sel_registerName", ctypes.default_abi, SEL, ctypes.char.ptr);
            const objc_getClass = objc.declare("objc_getClass", ctypes.default_abi, id, ctypes.char.ptr);

            const NSApp = objc_msgSend(objc_getClass("NSApplication"), sel_registerName("sharedApplication"));
            objc_msgSend_id(NSApp, sel_registerName("hide:"), id(0));
        } finally {
            objc.close();
        }
    }

    function getTrayService() {
        // no tray on Mac or other systems
        if (AppConstants.platform != "win" && AppConstants.platform != "linux")
            return { service: null, error: null };

        // this is Windows, tray is supported natively
        if (AppConstants.platform == "win")
            return { service: Ci.nsIMessengerWindowsIntegration, error: null };

        /* beginNoBetterbird */
        // this is Linux, no tray support
        if (AppConstants.platform == "linux")
            return { service: null, error: { code: "linuxUnsupported" } };
        /* endNoBetterbird */

        /* beginBetterbird */
        // this is Linux, check if tray is supported through Betterbird
        if (!Ci.nsIMessengerUnixIntegration) {
            if (AppConstants.MOZ_APP_DISPLAYNAME_DO_NOT_USE == "Betterbird")
                return { service: null, error: { code: "oldBetterbird", version: AppConstants.MOZ_APP_VERSION } };

            return { service: null, error: { code: "noBetterbird" } };
        }

        // this is Betterbird on Linux, check if desktop environment is supported
        const desktopEnvironment = appInfo.desktopEnvironment ?? gfxInfo.desktopEnvironment;
        const supportedDesktops = preferences.getStringPref("mail.minimizeToTray.supportedDesktops");

        // couldn't detect the desktop environment
        if (!desktopEnvironment) {
            // Betterbird escape hatch for when desktop detection fails
            if (supportedDesktops.includes("no-DE"))
                return { service: Ci.nsIMessengerUnixIntegration, error: null };

            return { service: null, error: { code: "noDesktopEnvironment" } };
        }

        // substring not present in supportedDesktops - this is how Betterbird implements this check
        if (!supportedDesktops.includes(desktopEnvironment))
            return { service: null, error: { code: "unsupportedDesktopEnvironment", desktopEnvironment } };

        return { service: Ci.nsIMessengerUnixIntegration, error: null };
        /* endBetterbird */
    }

    function moveToTray(window) {
        // macOS: hide or minimize based on user preference
        if (AppConstants.platform == "macosx") {
            if (macCloseBehavior === "hide") {
                try {
                    hideAppNatively();
                } catch (e) {
                    // fallback to minimize if native hide fails
                    window.minimize();
                }
                emitter.emit("closeToTray-macHidden");
            } else {
                window.minimize();
            }
            return;
        }

        const { service, error } = getTrayService();

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
        if (preferences.getBoolPref("mail.minimizeToTray", false))
            return;

        const baseWindow = window.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow);
        const resolvedService = Cc["@mozilla.org/messenger/osintegration;1"].getService(service);
        (resolvedService.hideWindow ?? resolvedService.HideWindow)(baseWindow);
    }

    function moveToTrayById(context, windowId) {
        const window = context.extension.windowManager.get(windowId, context).window;
        moveToTray(window);
    }

    function restoreHiddenMacWindows() {
        // with NSApp.hide(), Gecko's applicationShouldHandleReopen handler
        // restores windows automatically on Dock click; this is kept as a
        // no-op for API compatibility
    }

    function setMacCloseBehavior(behavior) {
        macCloseBehavior = behavior;
    }

    function registerWindow(context, windowId) {
        if (restorers.has(windowId))
            return;

        const window = context.extension.windowManager.get(windowId, context).window;
        const closeWindow = window.close;

        function handleClose(event) {
            // only hide Thunderbird when there are no other main windows
            if (restorers.size > 1) {
                restorers.delete(windowId);
                closeWindow();
                return;
            }

            event?.preventDefault();
            moveToTray(window);
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

    return class CloseToTray extends ExtensionCommon.ExtensionAPI {
        getAPI(context) {
            const onFailParams = {
                context,
                name: "closeToTray.event",
                register: fire => {
                    const listener = (_, ...params) => { fire.async(...params); };

                    emitter.on("closeToTray-fail", listener);
                    return () => { emitter.off("closeToTray-fail", listener); };
                }
            };

            const onMacHiddenParams = {
                context,
                name: "closeToTray.macHiddenEvent",
                register: fire => {
                    const listener = () => { fire.async(); };
                    emitter.on("closeToTray-macHidden", listener);
                    return () => { emitter.off("closeToTray-macHidden", listener); };
                }
            };

            return {
                closeToTray: {
                    registerWindow: registerWindow.bind(null, context),
                    moveToTray: moveToTrayById.bind(null, context),
                    restoreHiddenMacWindows,
                    setMacCloseBehavior,
                    onFail: new ExtensionCommon.EventManager(onFailParams).api(),
                    onMacHidden: new ExtensionCommon.EventManager(onMacHiddenParams).api()
                }
            };
        }

        onShutdown() {
            restorers.forEach(restore => restore());
            restorers.clear();
        }
    };
})();
