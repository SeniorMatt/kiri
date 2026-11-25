function log(...args: any[]) {
    console.log("Kiri:", ...args);
}

// Every change of the current desktop goes to the journal: "Kiri: desktop 1 -> 2 (swipe)" when Kiri did it,
// "(KWin)" when something else did (a KWin gesture, the pager, a shortcut Kiri does not own).
let desktopCause: string|null = null;
// the shortcut event being handled ("desktop-next press"), so that the journal says which key signal switched the desktop
let shortcutEvent: string|null = null;

function runShortcutEvent(name: string, kind: string, action: () => void) {
    shortcutEvent = name + " " + kind;
    if (name.startsWith("desktop-")) {
        log("shortcut", shortcutEvent);
    }
    try {
        action();
    } finally {
        shortcutEvent = null;
    }
}
// the desktop each output showed at the last logged change
const lastDesktopLabels = new Map<string, string>();

function desktopLabel(desktop: KwinDesktop) {
    const index = Workspace.desktops.indexOf(desktop);
    return index >= 0 ? String(index + 1) : "?";
}

function initDesktopLog() {
    for (const output of Workspace.screens) {
        lastDesktopLabels.set(output.name, desktopLabel(currentDesktopOn(output)));
    }
}

// the only way for Kiri to switch the desktop, so that the journal can say why
function gotoDesktop(desktop: KwinDesktop, cause: string, output: Output = Workspace.activeScreen) {
    if (desktop === currentDesktopOn(output)) {
        return;
    }
    desktopCause = cause;
    try {
        setCurrentDesktopOn(desktop, output);
    } finally {
        desktopCause = null;
    }
}

// Workspace.activeWindow = ..., logged when the window is on another desktop: KWin then switches to that desktop,
// which can undo a desktop switch that is still running
function activateWindow(kwinClient: KwinClient, cause: string) {
    if (!isOnShownDesktop(kwinClient)) {
        log("activating a window of another desktop:", cause, "desktop", desktopLabel(kwinClient.desktops[0]), "now on", desktopLabel(currentDesktopOn(kwinClient.output)));
    }
    Workspace.activeWindow = kwinClient;
}

function logDesktopChange(output: Output|undefined) {
    const outputName = output?.name ?? "";
    const now = desktopLabel(currentDesktopOn(output));
    const last = lastDesktopLabels.get(outputName);
    const on = output === undefined || Workspace.screens.length < 2 ? "" : " on " + outputName;
    if (now === last) {
        // every emission is logged, so that a switch that is undone inside the same signal cascade shows up
        log("desktop", now, "->", now + on, "(" + (desktopCause ?? "KWin") + ", unchanged, of", Workspace.desktops.length, "desktops)");
        return;
    }
    log("desktop", last ?? "?", "->", now + on, "(" + (desktopCause ?? "KWin") + ")");
    lastDesktopLabels.set(outputName, now);
}
