window.addEventListener("load", () => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");

    Array.from(document.getElementsByClassName(code)).forEach(element => element.hidden = false);

    Array.from(document.getElementsByClassName(".close")).forEach(
        button => button.addEventListener("click", () => {
            console.log("closing");
            window.close();
        })
    );

    document.getElementById("version").innerText = params.get("version");
    document.getElementById("desktopEnvironment").innerText = params.get("desktopEnvironment");
});
