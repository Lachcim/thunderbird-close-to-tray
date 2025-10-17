![Close to Tray](src/img/128.png)

# Close to Tray

A Thunderbird extension for Windows that moves the main window to the tray when you close it.

* Prevents you from accidentally quitting Thunderbird
* `X` moves the window to tray, `_` minimizes it – just like Discord
* Doesn't tray the window when you go to desktop (Windows+D)
* Choose "Exit" from the hamburger menu or press Ctrl+Shift+Q to quit

## Close to Tray vs alternatives

#### Why not `mail.minimizeToTray`?

Thunderbird on Windows offers the option "When Thunderbird is minimized, move it to the tray," a.k.a. `mail.minimizeToTray`.

Enabling `mail.minimizeToTray` takes away your ability to minimize the window without moving it to the tray. Sometimes you just want it out of the way for a while, but you'd like to come back to it later. Close to Tray gives you the freedom to do just that.

When `mail.minimizeToTray` is enabled, it's also possible to move Thunderbird to the tray even when it's out of focus. This happens when you click the "Show desktop" button, or press Windows+D. This behavior is disruptive and goes against user expectations.

Enabling this option does not prevent you from accidentally closing your mail client when you press the `X` button.

#### Why not [Minimize on Close](https://github.com/rsjtdrjgfuzkfg/thunderbird-minimizeonclose)?

Minimize on Close makes the close button behave like the minimize button. It prevents you from accidentally closing Thunderbird, but it effectively makes it impossible to remove it from your taskbar, unless you enable `mail.minimizeToTray`. Close to Tray retains the distinction between closing to tray and minimizing.

Minimize on Close knows nothing about the tray. If you want to move your window to the tray, the author suggests that you enable `mail.minimizeToTray` or use an external program. In Close to Tray, the tray is a first-class citizen – no tinkering required.

## Build instructions

On a typical Linux system or WSL, run `make`.
