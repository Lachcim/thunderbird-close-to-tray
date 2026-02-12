# macOS対応: 調査結果・実装計画・タスク

## 1. 概要

Close to Tray拡張機能にmacOSサポートを追加する。macOSにはシステムトレイがないため、代わりに「ウィンドウ非表示（Dockアイコンクリックで復元）」または「Dock最小化」の2つの動作をオプションで選択可能にする。

**スコープ**: 閉じるボタンの挙動のみ（「起動時にトレイに格納」機能のMac対応はスコープ外）

---

## 2. 調査結果

### 2.1 プロジェクト構成

```
src/
├── manifest.json          # 拡張機能マニフェスト (Manifest V2)
├── background.js          # バックグラウンドスクリプト（ウィンドウ管理の統括）
├── errorHandler.js        # エラーダイアログ管理
├── closeToTray.js         # コア機能（Experiment API, 特権コード）
├── closeToTray.json       # closeToTray APIスキーマ定義
├── startInTray.js         # 起動時トレイ格納（Experiment API）
├── startInTray.json       # startInTray APIスキーマ定義
├── ui/
│   ├── options.html       # 設定画面
│   ├── options.js         # 設定画面ロジック
│   ├── options.css        # 設定画面スタイル
│   ├── error.html         # エラーダイアログ
│   ├── error.js           # エラーダイアログロジック
│   └── error.css          # エラーダイアログスタイル
└── img/                   # アイコン画像
make.py                    # ビルドスクリプト（2つの.xpiを生成）
```

### 2.2 アーキテクチャ

拡張機能は**Thunderbird Experiment APIs**（特権拡張API）を使用。2つのカスタムAPIがある:

1. **closeToTray API** (`closeToTray.js` / `closeToTray.json`)
   - `registerWindow(windowId)`: ウィンドウの閉じるイベントを傍受し、トレイに移動
   - `moveToTray(windowId)`: ウィンドウを即座にトレイに移動
   - `onFail` イベント: トレイ操作失敗時に発火

2. **startInTray API** (`startInTray.js` / `startInTray.json`)
   - `hijackSessionStoreManager()`: セッション復元を制御
   - `restoreSessionStoreManager()`: 元のセッション管理に戻す
   - `restoreHiddenWindows(parentWindowId)`: 非表示ウィンドウを復元

### 2.3 現在のプラットフォーム対応状況

| プラットフォーム | トレイ対応 | 使用サービス | 備考 |
|---|---|---|---|
| Windows | ○ ネイティブ | `nsIMessengerWindowsIntegration` | Thunderbird 76+ |
| Linux (Betterbird) | △ 条件付き | `nsIMessengerUnixIntegration` | Betterbird 102.15.1+, 特定DE |
| Linux (通常TB) | × | なし | エラーダイアログを表示 |
| **macOS** | **× 未対応** | **なし** | **`window.minimize()` のみ実行** |

### 2.4 プラットフォーム検出方法

- `AppConstants.platform`: `"win"` / `"linux"` / `"macosx"`
- Experiment APIの特権コード内でのみ利用可能

### 2.5 コアロジックの詳細フロー

#### `closeToTray.js` の処理フロー

```
registerWindow(windowId)
  ├── window.addEventListener("close", handleClose)  // タスクバーからの閉じる
  └── window.close = handleClose                       // Xボタンからの閉じる

handleClose(event)
  ├── restorers.size > 1 → 通常のclose（他にメインウィンドウがある）
  └── restorers.size == 1 → event.preventDefault() + moveToTray(window)

moveToTray(window)
  ├── macOS → hideAppNatively() or window.minimize()
  ├── getTrayService() → { service, error }
  ├── error あり → emitter.emit("closeToTray-fail", error)
  ├── window.minimize()  ← Windows/Linux共通
  ├── service なし → return（最小化のみ）
  ├── mail.minimizeToTray が有効 → return（TB本体の処理に任せる）
  └── nsIBaseWindow + osintegration サービスで非表示化
```

### 2.6 ビルドシステム

`make.py` が2つの`.xpi`を生成:
- **通常版**: `closeToTray-1.6-tb149-(for Windows).xpi` — Betterbirdコードを除去
- **Betterbird版**: `closeToTray-1.6-betterbird.xpi` — Linuxサポート付き

条件付きブロックのマーカー:
- `/* beginBetterbird */` ... `/* endBetterbird */` — Betterbird専用コード
- `/* beginNoBetterbird */` ... `/* endNoBetterbird */` — 通常TB専用コード

### 2.7 設定管理

- WebExtension側: `browser.storage.local` で `options` オブジェクトを保存
  - 現在: `{ startInTray: boolean }`
  - macOS追加後: `{ startInTray: boolean, macCloseBehavior: "hide" | "minimize" }`
- Experiment API側: `Cc["@mozilla.org/preferences-service;1"]` で Thunderbird設定を読み込み
- 2つの設定ストアの間に直接的な橋渡しはない（`startInTray` は API関数呼び出しで反映）

### 2.8 macOSネイティブAPI

macOSでのウィンドウ非表示には、Objective-Cランタイムの `[NSApp hide:nil]` を使用する。これはmacOSネイティブアプリが `Cmd+H` で使用するのと同じ隠すメカニズム。

**利用する技術:**
- **js-ctypes** (`resource://gre/modules/ctypes.sys.mjs`): GeckoのFFI機構。ネイティブC/Objective-C関数をJavaScriptから呼び出し可能
- **libobjc.A.dylib**: Objective-Cランタイムライブラリ
  - `objc_getClass("NSApplication")`: NSApplicationクラスを取得
  - `sel_registerName("sharedApplication")` / `sel_registerName("hide:")`: セレクタ登録
  - `objc_msgSend(class, selector, ...)`: メッセージ送信（Objective-Cメソッド呼び出し）

**復元メカニズム:**
- Dockアイコンクリック時、Geckoの `applicationShouldHandleReopen` ハンドラが自動的にウィンドウを復元
- 拡張機能側で復元ロジックを実装する必要なし（Gecko内蔵機能に委任）

---

## 3. 設計判断

### 3.1 「非表示」モードの実装方式

**最終選択: `[NSApp hide:nil]` — Objective-Cランタイム経由のネイティブmacOS非表示**

検討した方式と却下理由:

| 方式 | 結果 | 問題 |
|---|---|---|
| `nsIBaseWindow.visibility = false` | 却下 | Dockクリック時にGeckoの `ReOpen()` が新規ウィンドウを開き、開くアニメーションが表示される |
| `setPosition(-32000, -32000)` (画面外移動) | 却下 | 大画面で画面上に表示される。Dockクリックで1回目は復元されず、別アプリをクリック後に再クリックが必要 |
| **`[NSApp hide:nil]`** | **採用** | ネイティブmacOSの「アプリを隠す」と同じ動作。Dockクリックで即座に復元。アニメーションなし |

**採用理由:**
- macOSネイティブアプリと同じ `Cmd+H` の挙動を再現
- Geckoの `applicationShouldHandleReopen` が自動的にウィンドウを復元
- 復元時のアニメーションなし（瞬時に表示）
- ウィンドウの位置やサイズが保持される

### 3.2 復元トリガーの検知方法

**最終選択: Geckoの自動復元に委任（拡張機能側の復元ロジックは安全策として保持）**

`NSApp.hide()` を使用する場合、Geckoの内蔵 `applicationShouldHandleReopen` ハンドラがDockクリック時に自動的にウィンドウを復元する。そのため `restoreHiddenMacWindows()` はno-op（何もしない関数）として維持し、`background.js` の復元リスナーは安全策として残す。

### 3.3 設定値の受け渡し

**選択: `setMacCloseBehavior()` API関数でWebExtension → Experiment APIに設定を渡す**

理由:
- 既存パターン（`startInTray` も API関数呼び出しで状態を変更）に合致
- `browser.storage.local` と `nsIPrefService` の橋渡しが不要

### 3.4 デフォルト動作

**選択: `"minimize"`（Dock最小化）をデフォルト**

理由:
- 最小化は安全で、ウィンドウが「見えなくなって復元不能」になるリスクがない
- 「非表示」はユーザーが明示的に選択した場合のみ有効化

### 3.5 ビルドシステムへの影響

**選択: 変更なし**

理由:
- macOSコードはランタイムの `AppConstants.platform == "macosx"` チェックで分岐
- 条件付きビルドブロックは不要

---

## 4. 実装計画

### 4.1 変更対象ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/closeToTray.js` | macOS非表示/最小化ロジック、ctypes経由のNSApp.hide()、設定セッター、新イベント |
| `src/closeToTray.json` | 新API関数・イベントのスキーマ定義 |
| `src/background.js` | macOS設定同期、storageリスナー、復元リスナー（安全策） |
| `src/ui/options.html` | macOS動作選択のラジオボタンUI |
| `src/ui/options.js` | プラットフォーム検知、ラジオボタン状態管理 |
| `src/ui/options.css` | ラジオボタンのスタイル |

### 4.2 各ファイルの詳細変更内容

#### 4.2.1 `src/closeToTray.js`

**a) 変数追加** — `restorers`, `emitter` 宣言の後に:

```javascript
let macCloseBehavior = "minimize"; // "hide" or "minimize"
```

**b) `hideAppNatively()` 関数追加** — ctypes経由でObjective-Cランタイムを呼び出し:

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

> **重要**: `objc_msgSend` はシグネチャごとに別の宣言が必要。`[NSApplication sharedApplication]` は `(id, SEL) -> id`、`[NSApp hide:nil]` は `(id, SEL, id) -> void` という異なるシグネチャを持つ。

**c) `moveToTray()` — macOS分岐を既存コードの前に追加**

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

**d) `restoreHiddenMacWindows()` 関数追加**

```javascript
function restoreHiddenMacWindows() {
    // with NSApp.hide(), Gecko's applicationShouldHandleReopen handler
    // restores windows automatically on Dock click; this is kept as a
    // no-op for API compatibility
}
```

**e) `setMacCloseBehavior()` 関数追加**

```javascript
function setMacCloseBehavior(behavior) {
    macCloseBehavior = behavior;
}
```

**f) API公開 — `getAPI()` の修正**

`onMacHidden` イベントマネージャーを追加:

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

return オブジェクトに追加:

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

`functions` 配列に追加:

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

`events` 配列に追加:

```json
{
    "name": "onMacHidden",
    "type": "function",
    "description": "Called when a window is hidden on macOS.",
    "parameters": []
}
```

#### 4.2.3 `src/background.js`

**a) 起動時の設定反映を追加:**

```javascript
async function applyMacCloseBehavior() {
    const storage = await browser.storage.local.get("options");
    messenger.closeToTray.setMacCloseBehavior(
        storage.options?.macCloseBehavior ?? "minimize"
    );
}
applyMacCloseBehavior();
```

**b) 設定変更リスナーを追加:**

```javascript
browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.options) {
        const behavior = changes.options.newValue?.macCloseBehavior ?? "minimize";
        messenger.closeToTray.setMacCloseBehavior(behavior);
    }
});
```

**c) macOS非表示時の復元リスナーを追加（安全策）:**

`NSApp.hide()` ではGeckoが自動復元するため `restoreHiddenMacWindows()` はno-opだが、リスナーは将来の互換性と安全策として保持:

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

既存のcheckbox + labelの下にmacOS設定セクションを追加:

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

`load` イベントリスナー内に以下を追加:

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

追加:

```css
#mac-options {
    margin-top: 1rem;
}

input[type=radio], input[type=radio] + label {
    display: inline-block;
}
```

---

## 5. 実装の経緯と検討過程

開発中に「非表示」モードの実装方式を3回変更した。以下にその経緯を記録する。

### 5.1 第1案: `nsIBaseWindow.visibility = false`

XPCOMの標準APIを使用してウィンドウを非表示にする方式。ウィンドウの非表示自体は動作するが、Dockクリック時にGeckoの `ReOpen()` が `visibility == false` を「ウィンドウなし」と判定し、新規ウィンドウを開いてしまう。その結果、画面中央からウィンドウが広がるアニメーション付きで新しいウィンドウが表示される問題が発生。

### 5.2 第2案: `setPosition(-32000, -32000)` (画面外移動)

ウィンドウを画面外に移動して見えなくする方式。2つの問題が判明:
1. 大画面環境では(-32000, -32000)の位置がモニター上に表示される
2. Dockクリック時に1回目では復元されず、別アプリをクリックしてフォーカスを移してから再クリックする必要がある

### 5.3 最終案: `[NSApp hide:nil]` (採用)

Objective-Cランタイムを直接呼び出してmacOSネイティブのアプリ非表示メカニズムを使用。`Cmd+H` と同じ動作で、Dockクリックで即座に復元される。Geckoの `applicationShouldHandleReopen` ハンドラが自動的に復元を処理するため、拡張機能側の復元ロジックは不要。

**ctypes実装の注意点**: `objc_msgSend` は可変長引数のC関数だが、ctypesでは引数の数と型ごとに別の宣言が必要。`[NSApplication sharedApplication]` (2引数、戻り値id) と `[NSApp hide:nil]` (3引数、戻り値void) で別々の宣言を使用する。

---

## 6. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| ctypes/libobjcが利用不可 | `hideAppNatively()` が例外をスロー | try/catchで `window.minimize()` にフォールバック |
| Geckoの `applicationShouldHandleReopen` の挙動変更 | Dockクリック時にウィンドウが復元されない | `background.js` の復元リスナーが安全策として機能 |
| ウィンドウが非表示のまま復元不能 | ユーザーがThunderbirdを操作できなくなる | デフォルトは安全な「最小化」。「非表示」はユーザーが明示的に選択 |
| `browser.runtime.getPlatformInfo()` がTB 76で未対応 | オプション画面でmacOS判定できない | `getPlatformInfo()` はWebExtension標準APIでTB 76+で利用可能 |

---

## 7. タスク一覧

- [x] **Task 1**: `src/closeToTray.js` — macOS対応コアロジック追加
  - 変数 `macCloseBehavior` 追加
  - `hideAppNatively()` 関数追加（ctypes経由のNSApp.hide()）
  - `moveToTray()` にmacOS分岐追加
  - `restoreHiddenMacWindows()` 関数追加（no-op）
  - `setMacCloseBehavior()` 関数追加
  - `onMacHidden` イベント追加
  - API公開（`getAPI()` 修正）

- [x] **Task 2**: `src/closeToTray.json` — スキーマ定義追加
  - `restoreHiddenMacWindows` 関数定義
  - `setMacCloseBehavior` 関数定義
  - `onMacHidden` イベント定義

- [x] **Task 3**: `src/background.js` — macOS設定同期・復元リスナー追加
  - `applyMacCloseBehavior()` で起動時設定反映
  - `storage.onChanged` リスナーで設定変更即時反映
  - `onMacHidden` リスナーで復元検知（安全策として保持）

- [x] **Task 4**: `src/ui/options.html` — macOS設定UI追加
  - ラジオボタン（Minimize to Dock / Hide window）

- [x] **Task 5**: `src/ui/options.js` — プラットフォーム検知・設定保存
  - `browser.runtime.getPlatformInfo()` でmacOS判定
  - ラジオボタンの状態読み込み・保存

- [x] **Task 6**: `src/ui/options.css` — スタイル追加
  - ラジオボタンとmacOSセクションのスタイル

---

## 8. 検証方法

1. **macOS + 最小化モード**: 閉じるボタン → ウィンドウがDockに最小化 → Dockサムネイルクリックで復元
2. **macOS + 非表示モード**: 閉じるボタン → ウィンドウが瞬時に消滅 → Dockアイコンクリックで瞬時に復元
3. **Windows**: 既存動作が変わらないことを確認（回帰テスト）
4. **オプション画面**: macOSでのみラジオボタンが表示されること
5. **複数ウィンドウ**: 2つ以上ウィンドウがある場合、閉じるボタンは通常のクローズ動作をすること
6. **設定変更の即時反映**: オプション変更後、再起動なしで動作が変わること

---

## 9. 変更しないファイル

| ファイル | 理由 |
|---|---|
| `make.py` | macOSコードはランタイムチェックで分岐。条件付きビルドブロック不要 |
| `startInTray.js` / `startInTray.json` | 今回スコープ外 |
| `errorHandler.js` / `ui/error.html` / `ui/error.js` | macOSではエラーを出さない |
| `manifest.json` | API定義はスキーマJSONで行うため変更不要 |
