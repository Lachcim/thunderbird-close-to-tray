let errorWindowId = null;
let errorWindowParams = null;

async function getErrorWindow(error) {
    if (errorWindowId == null)
        return { window: null, valid: false };

    try {
        const window = await browser.windows.get(errorWindowId);
        return { window, valid: JSON.stringify(error) == errorWindowParams };
    }
    catch {
        return { window: null, valid: false };
    }
}

async function handleFailure(error) {
    const { window, valid } = await getErrorWindow(error);

    if (window && valid) {
        browser.windows.update(window.id, { focused: true });
        return;
    }

    if (window)
        await browser.windows.remove(window.id);

    const newWindow = await browser.windows.create({
        type: "popup",
        url: `ui/error.html?${new URLSearchParams(error)}`,
        width: 440,
        height: 540
    });

    errorWindowId = newWindow.id;
    errorWindowParams = JSON.stringify(error);
}

messenger.closeToTray.onFail.addListener(handleFailure);
