// With "switch desktops independently for each screen" every output shows a desktop of its own; otherwise all outputs
// show the same one. These ask KWin per output, so that both cases work the same way.

function currentDesktopOn(output: Output|null|undefined): KwinDesktop {
    if (output !== null && output !== undefined && typeof Workspace.currentDesktopForScreen === "function") {
        return Workspace.currentDesktopForScreen(output) ?? Workspace.currentDesktop;
    }
    return Workspace.currentDesktop;
}

// switches that output only, or every output when KWin keeps the desktops together
function setCurrentDesktopOn(desktop: KwinDesktop, output: Output|null|undefined) {
    if (output !== null && output !== undefined && typeof Workspace.setCurrentDesktopForScreen === "function") {
        Workspace.setCurrentDesktopForScreen(desktop, output);
    } else {
        Workspace.currentDesktop = desktop;
    }
}

function isDesktopShownAnywhere(desktop: KwinDesktop) {
    if (typeof Workspace.currentDesktopForScreen !== "function") {
        return desktop === Workspace.currentDesktop;
    }
    return Workspace.screens.some(output => currentDesktopOn(output) === desktop);
}

// the window is on the desktop its own output shows now (a window on all desktops always is)
function isOnShownDesktop(kwinClient: KwinClient) {
    return kwinClient.desktops.length === 0 || kwinClient.desktops.includes(currentDesktopOn(kwinClient.output));
}
