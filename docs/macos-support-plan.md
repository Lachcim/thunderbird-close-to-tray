# macOS Support: Investigation, Implementation Plan & Tasks

## 1. Overview

Add macOS support to the Close to Tray extension. Since macOS does not have a system tray, two alternative behaviors are offered as user-configurable options: "Hide window (restore by clicking Dock icon)" or "Minimize to Dock".

**Scope**: Close button behavior only ("Start in tray" feature for Mac is out of scope)

---

## 2. Investigation Results

### 2.1 Project Structure

```
src/
├── manifest.json          # Extension manifest (Manifest V2)
├── background.js          # Background script (window management orchestrator)
├── errorHandler.js        # Error dialog management
├── closeToTray.js         # Core functionality (Experiment API, privileged code)
├── closeToTray.json       # closeToTray API schema definition
├── startInTray.js         # Start in tray feature (Experiment API)
├── startInTray.json       # startInTray API schema definition
├── ui/
│   ├── options.html       # Settings page
│   ├── options.js         # Settings page logic
│   ├── options.css        # Settings page styles
│   ├── error.html         # Error dialog
│   ├── error.js           # Error dialog logic
│   └── error.css          # Error dialog styles
└── img/                   # Icon images
make.py                    # Build script (generates two .xpi files)
```

### 2.2 Architecture

The extension uses **Thunderbird Experiment APIs** (privileged extension APIs). Two custom APIs exist:

1. **closeToTray API** (`closeToTray.js` / `closeToTray.json`)
   - `registerWindow(windowId)`: Intercepts window close event and moves to tray
   - `moveToTray(windowId)`: Immediately moves window to tray
   - `onFail` event: Fires when tray operation fails

2. **startInTray API** (`startInTray.js` / `startInTray.json`)
   - `hijackSessionStoreManager()`: Controls session restoration
   - `restoreSessionStoreManager()`: Restores original session management
   - `restoreHiddenWindows(parentWindowId)`: Restores hidden windows

### 2.3 Current Platform Support

| Platform | Tray Support | Service Used | Notes |
|---|---|---|---|
| Windows | Native | `nsIMessengerWindowsIntegration` | Thunderbird 76+ |
| Linux (Betterbird) | Conditional | `nsIMessengerUnixIntegration` | Betterbird 102.15.1+, specific DEs |
| Linux (vanilla TB) | No | None | Shows error dialog |
| **macOS** | **Not supported** | **None** | **Only `window.minimize()` is called** |

### 2.4 Platform Detection

- `AppConstants.platform`: `"win"` / `"linux"` / `"macosx"`
- Only available within Experiment API privileged code

### 2.5 Core Logic Flow

#### `closeToTray.js` Processing Flow

```
registerWindow(windowId)
  ├── window.addEventListener("close", handleClose)  // close from taskbar
  └── window.close = handleClose                       // close from X button

handleClose(event)
  ├── restorers.size > 1 → normal close (other main windows exist)
  └── restorers.size == 1 → event.preventDefault() + moveToTray(window)

moveToTray(window)
  ├── macOS → hideAppNatively() or window.minimize()
  ├── getTrayService() → { service, error }
  ├── error exists → emitter.emit("closeToTray-fail", error)
  ├── window.minimize()  ← common to Windows/Linux
  ├── no service → return (minimize only)
  ├── mail.minimizeToTray enabled → return (delegate to TB itself)
  └── hide via nsIBaseWindow + osintegration service
```

### 2.6 Build System

`make.py` generates two `.xpi` files:
- **Standard version**: `closeToTray-1.6-tb149-(for Windows).xpi` — Betterbird code removed
- **Betterbird version**: `closeToTray-1.6-betterbird.xpi` — with Linux support

Conditional block markers:
- `/* beginBetterbird */` ... `/* endBetterbird */` — Betterbird-only code
- `/* beginNoBetterbird */` ... `/* endNoBetterbird */` — Standard TB-only code

### 2.7 Settings Management

- WebExtension side: stores `options` object via `browser.storage.local`
  - Current: `{ startInTray: boolean }`
  - After macOS addition: `{ startInTray: boolean, macCloseBehavior: "hide" | "minimize" }`
- Experiment API side: reads Thunderbird settings via `Cc["@mozilla.org/preferences-service;1"]`
- No direct bridge between the two stores (`startInTray` is reflected via API function calls)

### 2.8 macOS Native APIs

Window hiding on macOS uses `[NSApp hide:nil]` via the Objective-C runtime. This is the same hiding mechanism that native macOS apps use with `Cmd+H`.

**Technologies used:**
- **js-ctypes** (`resource://gre/modules/ctypes.sys.mjs`): Gecko's FFI mechanism for calling native C/Objective-C functions from JavaScript
- **libobjc.A.dylib**: Objective-C runtime library
  - `objc_getClass("NSApplication")`: Gets the NSApplication class
  - `sel_registerName("sharedApplication")` / `sel_registerName("hide:")`: Registers selectors
  - `objc_msgSend(class, selector, ...)`: Sends messages (Objective-C method calls)

**Restore mechanism:**
- When the Dock icon is clicked, Gecko's `applicationShouldHandleReopen` handler automatically restores windows
- No restore logic needed in the extension (delegated to Gecko's built-in functionality)

---

## 3. Design Decisions

### 3.1 "Hide" Mode Implementation

**Final choice: `[NSApp hide:nil]` — Native macOS hiding via Objective-C runtime**

Approaches considered and reasons for rejection:

| Approach | Result | Problem |
|---|---|---|
| `nsIBaseWindow.visibility = false` | Rejected | On Dock click, Gecko's `ReOpen()` opens a new window with opening animation |
| `setPosition(-32000, -32000)` (off-screen) | Rejected | Window visible on large screens. Dock click doesn't restore on first attempt; requires clicking another app first |
| **`[NSApp hide:nil]`** | **Adopted** | Same behavior as native macOS "Hide App". Instant restore on Dock click. No animation |

**Rationale:**
- Reproduces the same `Cmd+H` behavior as native macOS apps
- Gecko's `applicationShouldHandleReopen` automatically restores windows
- No animation on restore (instant display)
- Window position and size are preserved

### 3.2 Restore Trigger Detection

**Final choice: Delegate to Gecko's automatic restoration (extension-side restore logic kept as safety net)**

When using `NSApp.hide()`, Gecko's built-in `applicationShouldHandleReopen` handler automatically restores windows on Dock click. Therefore `restoreHiddenMacWindows()` is maintained as a no-op (empty function), and the restore listeners in `background.js` are kept as a safety net.

### 3.3 Preference Bridging

**Choice: `setMacCloseBehavior()` API function to pass settings from WebExtension → Experiment API**

Rationale:
- Matches existing pattern (`startInTray` also changes state via API function calls)
- No need to bridge `browser.storage.local` and `nsIPrefService`

### 3.4 Default Behavior

**Choice: `"minimize"` (Dock minimize) as default**

Rationale:
- Minimize is safe with no risk of windows becoming invisible and unrecoverable
- "Hide" is only enabled when explicitly selected by the user

### 3.5 Build System Impact

**Choice: No changes**

Rationale:
- macOS code branches at runtime via `AppConstants.platform == "macosx"` check
- No conditional build blocks needed

---

## 4. Implementation Plan

### 4.1 Files to Modify

| File | Changes |
|---|---|
| `src/closeToTray.js` | macOS hide/minimize logic, NSApp.hide() via ctypes, settings setter, new event |
| `src/closeToTray.json` | Schema definitions for new API functions and event |
| `src/background.js` | macOS settings sync, storage listener, restore listeners (safety net) |
| `src/ui/options.html` | Radio button UI for macOS behavior selection |
| `src/ui/options.js` | Platform detection, radio button state management |
| `src/ui/options.css` | Styles for radio buttons |

### 4.2 Detailed Changes per File

#### 4.2.1 `src/closeToTray.js`

**a) Add variable** — after `restorers`, `emitter` declarations:

```javascript
let macCloseBehavior = "minimize"; // "hide" or "minimize"
```

**b) Add `hideAppNatively()` function** — calls Objective-C runtime via ctypes:

```javascript
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
```

> **Important**: `objc_msgSend` requires separate declarations per signature. `[NSApplication sharedApplication]` has signature `(id, SEL) -> id`, while `[NSApp hide:nil]` has signature `(id, SEL, id) -> void`.

**c) `moveToTray()` — add macOS branch before existing code**

```javascript
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

    // existing Windows/Linux code follows unchanged...
}
```

**d) Add `restoreHiddenMacWindows()` function**

```javascript
function restoreHiddenMacWindows() {
    // with NSApp.hide(), Gecko's applicationShouldHandleReopen handler
    // restores windows automatically on Dock click; this is kept as a
    // no-op for API compatibility
}
```

**e) Add `setMacCloseBehavior()` function**

```javascript
function setMacCloseBehavior(behavior) {
    macCloseBehavior = behavior;
}
```

**f) API exposure — modify `getAPI()`**

Add `onMacHidden` event manager:

```javascript
const onMacHiddenParams = {
    context,
    name: "closeToTray.macHiddenEvent",
    register: fire => {
        const listener = () => { fire.async(); };
        emitter.on("closeToTray-macHidden", listener);
        return () => { emitter.off("closeToTray-macHidden", listener); };
    }
};
```

Add to return object:

```javascript
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
```

#### 4.2.2 `src/closeToTray.json`

Add to `functions` array:

```json
{
    "name": "restoreHiddenMacWindows",
    "type": "function",
    "description": "Restore all hidden macOS windows.",
    "async": false,
    "parameters": []
},
{
    "name": "setMacCloseBehavior",
    "type": "function",
    "description": "Set the macOS close behavior.",
    "async": false,
    "parameters": [
        {
            "name": "behavior",
            "type": "string",
            "description": "The close behavior: 'hide' or 'minimize'."
        }
    ]
}
```

Add to `events` array:

```json
{
    "name": "onMacHidden",
    "type": "function",
    "description": "Called when a window is hidden on macOS.",
    "parameters": []
}
```

#### 4.2.3 `src/background.js`

**a) Add startup settings application:**

```javascript
async function applyMacCloseBehavior() {
    const storage = await browser.storage.local.get("options");
    messenger.closeToTray.setMacCloseBehavior(
        storage.options?.macCloseBehavior ?? "minimize"
    );
}
applyMacCloseBehavior();
```

**b) Add settings change listener:**

```javascript
browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.options) {
        const behavior = changes.options.newValue?.macCloseBehavior ?? "minimize";
        messenger.closeToTray.setMacCloseBehavior(behavior);
    }
});
```

**c) Add macOS hidden window restore listeners (safety net):**

With `NSApp.hide()`, Gecko handles restoration automatically, so `restoreHiddenMacWindows()` is a no-op. These listeners are kept as a safety net for future compatibility:

```javascript
let macWindowsHidden = false;

messenger.closeToTray.onMacHidden.addListener(() => {
    macWindowsHidden = true;
    browser.windows.onFocusChanged.addListener(handleMacRestore);
    browser.windows.onCreated.addListener(handleMacNewWindow);
});

function handleMacRestore(windowId) {
    if (!macWindowsHidden) return;
    if (windowId === browser.windows.WINDOW_ID_NONE) return;

    macWindowsHidden = false;
    messenger.closeToTray.restoreHiddenMacWindows();
    browser.windows.onFocusChanged.removeListener(handleMacRestore);
    browser.windows.onCreated.removeListener(handleMacNewWindow);
}

async function handleMacNewWindow(newWindow) {
    if (!macWindowsHidden) return;

    macWindowsHidden = false;
    messenger.closeToTray.restoreHiddenMacWindows();

    // close the spurious window opened by Gecko's ReOpen()
    try { await browser.windows.remove(newWindow.id); }
    catch (e) { /* window may have already been closed */ }

    browser.windows.onFocusChanged.removeListener(handleMacRestore);
    browser.windows.onCreated.removeListener(handleMacNewWindow);
}
```

#### 4.2.4 `src/ui/options.html`

Add macOS settings section below existing checkbox + label:

```html
<div id="mac-options" hidden>
    <p><strong>When closing Thunderbird on macOS:</strong></p>
    <div>
        <input type="radio" name="mac-close-behavior" id="mac-minimize" value="minimize">
        <label for="mac-minimize">Minimize to Dock</label>
    </div>
    <div>
        <input type="radio" name="mac-close-behavior" id="mac-hide" value="hide">
        <label for="mac-hide">Hide window (click Dock icon to restore)</label>
    </div>
</div>
```

#### 4.2.5 `src/ui/options.js`

Add inside the `load` event listener:

```javascript
// macOS-specific options
const platformInfo = await browser.runtime.getPlatformInfo();
if (platformInfo.os === "mac") {
    document.getElementById("mac-options").hidden = false;

    const minimizeRadio = document.getElementById("mac-minimize");
    const hideRadio = document.getElementById("mac-hide");

    if (options.macCloseBehavior === "hide") hideRadio.checked = true;
    else minimizeRadio.checked = true;

    const handleRadioChange = async () => {
        options.macCloseBehavior = hideRadio.checked ? "hide" : "minimize";
        await browser.storage.local.set({ options });
    };

    minimizeRadio.addEventListener("change", handleRadioChange);
    hideRadio.addEventListener("change", handleRadioChange);
}
```

#### 4.2.6 `src/ui/options.css`

Add:

```css
#mac-options {
    margin-top: 1rem;
}

input[type=radio], input[type=radio] + label {
    display: inline-block;
}
```

---

## 5. Implementation History

During development, the "Hide" mode implementation was revised three times. This section documents the process.

### 5.1 Attempt 1: `nsIBaseWindow.visibility = false`

Used the standard XPCOM API to hide windows. While hiding itself worked, clicking the Dock icon caused Gecko's `ReOpen()` to interpret `visibility == false` as "no windows exist" and open a new window. This resulted in a new window appearing with an expanding animation from the center of the screen.

### 5.2 Attempt 2: `setPosition(-32000, -32000)` (off-screen)

Moved the window off-screen to make it invisible. Two problems were identified:
1. On large screen setups, the position (-32000, -32000) was actually visible on the monitor
2. The first Dock click did not restore the window; it required clicking another app to shift focus, then clicking the Dock icon again

### 5.3 Final Solution: `[NSApp hide:nil]` (Adopted)

Directly calls the Objective-C runtime to use macOS's native app hiding mechanism. Behaves identically to `Cmd+H`, with instant restoration on Dock click. Gecko's `applicationShouldHandleReopen` handler automatically handles restoration, so no restore logic is needed in the extension.

**ctypes implementation note**: `objc_msgSend` is a variadic C function, but ctypes requires separate declarations for each argument count and type combination. Separate declarations are used for `[NSApplication sharedApplication]` (2 args, returns id) and `[NSApp hide:nil]` (3 args, returns void).

---

## 6. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| ctypes/libobjc unavailable | `hideAppNatively()` throws exception | try/catch fallback to `window.minimize()` |
| Gecko's `applicationShouldHandleReopen` behavior changes | Windows not restored on Dock click | Restore listeners in `background.js` serve as safety net |
| Window remains hidden and unrecoverable | User cannot interact with Thunderbird | Default is safe "minimize". "Hide" only enabled when explicitly selected |
| `browser.runtime.getPlatformInfo()` unavailable on TB 76 | Cannot detect macOS on options page | `getPlatformInfo()` is a standard WebExtension API available on TB 76+ |

---

## 7. Task List

- [x] **Task 1**: `src/closeToTray.js` — Add macOS core logic
  - Add `macCloseBehavior` variable
  - Add `hideAppNatively()` function (NSApp.hide() via ctypes)
  - Add macOS branch to `moveToTray()`
  - Add `restoreHiddenMacWindows()` function (no-op)
  - Add `setMacCloseBehavior()` function
  - Add `onMacHidden` event
  - Expose API (`getAPI()` modification)

- [x] **Task 2**: `src/closeToTray.json` — Add schema definitions
  - `restoreHiddenMacWindows` function definition
  - `setMacCloseBehavior` function definition
  - `onMacHidden` event definition

- [x] **Task 3**: `src/background.js` — Add macOS settings sync and restore listeners
  - `applyMacCloseBehavior()` for startup settings application
  - `storage.onChanged` listener for immediate settings sync
  - `onMacHidden` listener for restore detection (kept as safety net)

- [x] **Task 4**: `src/ui/options.html` — Add macOS settings UI
  - Radio buttons (Minimize to Dock / Hide window)

- [x] **Task 5**: `src/ui/options.js` — Add platform detection and settings persistence
  - `browser.runtime.getPlatformInfo()` for macOS detection
  - Radio button state loading and saving

- [x] **Task 6**: `src/ui/options.css` — Add styles
  - Radio button and macOS section styles

---

## 8. Verification

1. **macOS + Minimize mode**: Close button → window minimizes to Dock → click Dock thumbnail to restore
2. **macOS + Hide mode**: Close button → window disappears instantly → click Dock icon to restore instantly
3. **Windows**: Verify existing behavior is unchanged (regression test)
4. **Options page**: Radio buttons should only appear on macOS
5. **Multiple windows**: With 2+ windows open, close button should perform normal close
6. **Immediate settings sync**: After changing options, behavior should change without restart

---

## 9. Files Not Modified

| File | Reason |
|---|---|
| `make.py` | macOS code branches at runtime check. No conditional build blocks needed |
| `startInTray.js` / `startInTray.json` | Out of scope for this change |
| `errorHandler.js` / `ui/error.html` / `ui/error.js` | No errors on macOS |
| `manifest.json` | API definitions are in schema JSON files, no changes needed |
