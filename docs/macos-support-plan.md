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
  ├── getTrayService() → { service, error }
  ├── error あり → emitter.emit("closeToTray-fail", error)
  ├── window.minimize()  ← 全プラットフォーム共通
  ├── service なし → return（macOSはここで終了、最小化のみ）
  ├── mail.minimizeToTray が有効 → return（TB本体の処理に任せる）
  └── nsIBaseWindow + osintegration サービスで非表示化
```

#### `getTrayService()` の分岐

```javascript
// closeToTray.js:16-59
function getTrayService() {
    // macOS: service=null, error=null → moveToTray()でminimize()のみ実行
    if (AppConstants.platform != "win" && AppConstants.platform != "linux")
        return { service: null, error: null };

    // Windows: ネイティブトレイサポート
    if (AppConstants.platform == "win")
        return { service: Ci.nsIMessengerWindowsIntegration, error: null };

    // Linux: Betterbird判定（条件付きビルドブロック使用）
    // ... (省略)
}
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
- Experiment API側: `Cc["@mozilla.org/preferences-service;1"]` で Thunderbird設定を読み込み
- 2つの設定ストアの間に直接的な橋渡しはない（`startInTray` は API関数呼び出しで反映）

### 2.8 macOSで利用可能なXPCOM API

- `nsIBaseWindow.visibility`: ウィンドウの表示/非表示を制御
  - `visibility = false` → ウィンドウ完全非表示
  - `visibility = true` → ウィンドウ再表示
- `nsIWindowMediator`: ウィンドウの列挙が可能
  - `getEnumerator("mail:3pane")` でメインウィンドウを取得
- macOSのDockクリック時: Geckoの `ReOpen()` が呼ばれる
  - 可視ウィンドウがなければ新規ウィンドウを開こうとする
  - 最小化ウィンドウがあれば `deminiaturize` を呼ぶ

---

## 3. 設計判断

### 3.1 「非表示」モードの実装方式

**選択: `nsIBaseWindow.visibility = false` + WebExtensionレベルの復元検知**

理由:
- `nsIBaseWindow.visibility` はXPCOMの標準APIで信頼性が高い
- Experiment APIの特権コード内でアクセス可能
- Windows版の `HideWindow` に最も近い動作

### 3.2 復元トリガーの検知方法

**選択: `windows.onFocusChanged` + `windows.onCreated` の併用**

理由:
- Dockクリック時、Geckoが既存ウィンドウにフォーカスを移すか新規ウィンドウを開く
- `onFocusChanged`: フォーカス変更を検知（主要パス）
- `onCreated`: Geckoが新規ウィンドウを開いた場合のフォールバック
- 両方を組み合わせることで確実に復元できる

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
| `src/closeToTray.js` | macOS非表示/最小化ロジック、復元関数、設定セッター、新イベント |
| `src/closeToTray.json` | 新API関数・イベントのスキーマ定義 |
| `src/background.js` | macOS復元検知、設定同期、storageリスナー |
| `src/ui/options.html` | macOS動作選択のラジオボタンUI |
| `src/ui/options.js` | プラットフォーム検知、ラジオボタン状態管理 |
| `src/ui/options.css` | ラジオボタンのスタイル |

### 4.2 各ファイルの詳細変更内容

#### 4.2.1 `src/closeToTray.js`

**a) 変数追加** — `restorers`, `emitter` 宣言の後に:

```javascript
let macCloseBehavior = "minimize"; // "hide" or "minimize"
```

**b) `moveToTray()` — macOS分岐を既存コードの前に追加**

```javascript
function moveToTray(window) {
    // macOS: hide or minimize based on user preference
    if (AppConstants.platform == "macosx") {
        if (macCloseBehavior === "hide") {
            const baseWindow = window.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow);
            baseWindow.visibility = false;
            emitter.emit("closeToTray-macHidden");
        } else {
            window.minimize();
        }
        return;
    }

    // existing Windows/Linux code follows unchanged...
    const { service, error } = getTrayService();
    // ...
}
```

**c) `restoreHiddenMacWindows()` 関数追加**

```javascript
function restoreHiddenMacWindows() {
    if (AppConstants.platform != "macosx") return;

    const wm = Cc["@mozilla.org/appshell/window-mediator;1"]
        .getService(Ci.nsIWindowMediator);
    const enumerator = wm.getEnumerator("mail:3pane");

    while (enumerator.hasMoreElements()) {
        const win = enumerator.getNext();
        const baseWindow = win.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow);
        if (!baseWindow.visibility) {
            baseWindow.visibility = true;
            win.focus();
        }
    }
}
```

**d) `setMacCloseBehavior()` 関数追加**

```javascript
function setMacCloseBehavior(behavior) {
    macCloseBehavior = behavior;
}
```

**e) API公開 — `getAPI()` の修正**

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

**c) macOS非表示時の復元ロジックを追加:**

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

    try { await browser.windows.remove(newWindow.id); }
    catch (e) { /* window may have already been closed */ }

    browser.windows.onFocusChanged.removeListener(handleMacRestore);
    browser.windows.onCreated.removeListener(handleMacNewWindow);
}
```

#### 4.2.4 `src/ui/options.html`

既存のcheckbox + labelの下にmacOS設定セクションを追加:

```html
<div id="mac-options" style="display: none; margin-top: 1rem;">
    <p style="margin-bottom: 0.5rem;"><strong>When closing Thunderbird on macOS:</strong></p>
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
    const macOptionsDiv = document.getElementById("mac-options");
    macOptionsDiv.style.display = "block";

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

## 5. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| `nsIBaseWindow.visibility = false` でGeckoの `ReOpen()` が新規ウィンドウを開く | ウィンドウが2つ表示される | `windows.onCreated` で新規ウィンドウを検知し、非表示ウィンドウを復元して新規ウィンドウを閉じる |
| Dockクリック時に `onFocusChanged` が発火しない | 非表示ウィンドウが復元されない | `onCreated` をフォールバックとして併用 |
| ウィンドウが非表示のまま復元不能 | ユーザーがThunderbirdを操作できなくなる | デフォルトは安全な「最小化」。「非表示」はユーザーが明示的に選択 |
| 複数ウィンドウが非表示になる | 復元ロジックが複雑化 | `restoreHiddenMacWindows()` で全 `mail:3pane` ウィンドウを列挙して復元 |
| `browser.runtime.getPlatformInfo()` がTB 76で未対応 | オプション画面でmacOS判定できない | `getPlatformInfo()` はWebExtension標準APIでTB 76+で利用可能 |

---

## 6. タスク一覧

- [ ] **Task 1**: `src/closeToTray.js` — macOS対応コアロジック追加
  - 変数 `macCloseBehavior` 追加
  - `moveToTray()` にmacOS分岐追加
  - `restoreHiddenMacWindows()` 関数追加
  - `setMacCloseBehavior()` 関数追加
  - `onMacHidden` イベント追加
  - API公開（`getAPI()` 修正）

- [ ] **Task 2**: `src/closeToTray.json` — スキーマ定義追加
  - `restoreHiddenMacWindows` 関数定義
  - `setMacCloseBehavior` 関数定義
  - `onMacHidden` イベント定義

- [ ] **Task 3**: `src/background.js` — macOS復元ロジック・設定同期追加
  - `applyMacCloseBehavior()` で起動時設定反映
  - `storage.onChanged` リスナーで設定変更即時反映
  - `onMacHidden` リスナーで復元検知（`onFocusChanged` + `onCreated`）

- [ ] **Task 4**: `src/ui/options.html` — macOS設定UI追加
  - ラジオボタン（Minimize to Dock / Hide window）

- [ ] **Task 5**: `src/ui/options.js` — プラットフォーム検知・設定保存
  - `browser.runtime.getPlatformInfo()` でmacOS判定
  - ラジオボタンの状態読み込み・保存

- [ ] **Task 6**: `src/ui/options.css` — スタイル追加
  - ラジオボタンとmacOSセクションのスタイル

---

## 7. 検証方法

1. **macOS + 最小化モード**: 閉じるボタン → ウィンドウがDockに最小化 → Dockサムネイルクリックで復元
2. **macOS + 非表示モード**: 閉じるボタン → ウィンドウ消滅 → Dockアイコンクリックで復元
3. **Windows**: 既存動作が変わらないことを確認（回帰テスト）
4. **オプション画面**: macOSでのみラジオボタンが表示されること
5. **複数ウィンドウ**: 2つ以上ウィンドウがある場合、閉じるボタンは通常のクローズ動作をすること
6. **設定変更の即時反映**: オプション変更後、再起動なしで動作が変わること

---

## 8. 変更しないファイル

| ファイル | 理由 |
|---|---|
| `make.py` | macOSコードはランタイムチェックで分岐。条件付きビルドブロック不要 |
| `startInTray.js` / `startInTray.json` | 今回スコープ外 |
| `errorHandler.js` / `ui/error.html` / `ui/error.js` | macOSではエラーを出さない |
| `manifest.json` | API定義はスキーマJSONで行うため変更不要 |
