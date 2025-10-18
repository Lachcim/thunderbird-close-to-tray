![Close to Tray](src/img/128.png)

# Close to Tray

A Thunderbird extension that moves the main window to the tray when you close it.

* Prevents you from accidentally quitting Thunderbird
* `X` moves the window to the tray, `_` minimizes it – just like Discord
* Doesn't hide your window when you press "Show desktop"
* Choose "Exit" from the hamburger menu or use a keyboard shortcut to quit

Close to Tray works with Linux when combined with [Betterbird](https://www.betterbird.eu/).

## Close to Tray vs alternatives

#### How is this different from "When Thunderbird is minimized, move it to the tray"?

Enabling this option doesn't let you choose between moving to tray and minimizing. Close to Tray retains the minimize functionality and gives you a separate way to move the window to the tray.

With this option enabled, it's still possible to accidentally quit Thunderbird. With Close to Tray, you explicitly have to click "Exit".

When this setting is on, clicking the "Show desktop" button will cause Thunderbird to move to the tray even when it's out of focus. Close to Tray will only move your window to the tray when you close it.

#### How is this different from [Minimize on Close](https://github.com/rsjtdrjgfuzkfg/thunderbird-minimizeonclose)?

Minimize on Close makes the close button behave like the minimize button. In Close to Tray, the buttons have separate uses.

## Close to Tray and Linux

Thunderbird on Linux lacks tray support. [Betterbird](https://www.betterbird.eu/) is a Thunderbird fork that supports the tray. Close to Tray works with Betterbird.

Close to Tray is confirmed to work with KDE, Gnome, Pop Gnome, Mate and XFCE. If you believe your desktop environment is supported, adjust `mail.minimizeToTray.supportedDesktops`. If your desktop environment is not being detected, add `no-DE` to the list of environments configured in the setting.

## Build instructions

On a typical Linux system or WSL, run `make`.
