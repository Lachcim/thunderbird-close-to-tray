![Close to Tray](src/img/128.png)

# Close to Tray

A Thunderbird extension for Windows that moves the main window to the tray when you close it.

* Prevents you from accidentally quitting Thunderbird
* `X` moves the window to the tray, `_` minimizes it – just like Discord
* Doesn't tray the window when you go to desktop (Windows+D)
* Choose "Exit" from the hamburger menu or press Ctrl+Shift+Q to quit

## Close to Tray vs alternatives

#### How is this different from "When Thunderbird is minimized, move it to the tray"?

Enabling this option doesn't let you choose between moving to tray and minimizing. Close to Tray retains the minimize functionality and gives you a separate way to move the window to the tray.

With this option enabled, it's still possible to accidentally quit Thunderbird. With Close to Tray, you explicitly have to click "Exit".

When this setting is on, pressing Windows+D will cause Thunderbird to move to the tray even when it's out of focus. Close to Tray will only move your window to the tray when you close it.

#### How is this different from [Minimize on Close](https://github.com/rsjtdrjgfuzkfg/thunderbird-minimizeonclose)?

Minimize on Close makes the close button behave like the minimize button. In Close to Tray, the buttons have separate uses.

## Build instructions

On a typical Linux system or WSL, run `make`.
