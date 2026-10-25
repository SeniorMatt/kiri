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
let lastDesktopLabel: string|null = null;

function desktopLabel(desktop: KwinDesktop) {
    const index = Workspace.desktops.indexOf(desktop);
    return index >= 0 ? String(index + 1) : "?";
}

function initDesktopLog() {
    lastDesktopLabel = desktopLabel(Workspace.currentDesktop);
}

// the only way for Kiri to switch the desktop, so that the journal can say why
function gotoDesktop(desktop: KwinDesktop, cause: string) {
    if (desktop === Workspace.currentDesktop) {
        return;
    }
    desktopCause = cause;
    try {
        Workspace.currentDesktop = desktop;
    } finally {
        desktopCause = null;
    }
}

// Workspace.activeWindow = ..., logged when the window is on another desktop: KWin then switches to that desktop,
// which can undo a desktop switch that is still running
function activateWindow(kwinClient: KwinClient, cause: string) {
    if (kwinClient.desktops.length > 0 && !kwinClient.desktops.includes(Workspace.currentDesktop)) {
        log("activating a window of another desktop:", cause, "desktop", desktopLabel(kwinClient.desktops[0]), "now on", desktopLabel(Workspace.currentDesktop));
    }
    Workspace.activeWindow = kwinClient;
}

function logDesktopChange() {
    const now = desktopLabel(Workspace.currentDesktop);
    if (now === lastDesktopLabel) {
        // every emission is logged, so that a switch that is undone inside the same signal cascade shows up
        log("desktop", now, "->", now, "(" + (desktopCause ?? "KWin") + ", unchanged, of", Workspace.desktops.length, "desktops)");
        return;
    }
    log("desktop", lastDesktopLabel ?? "?", "->", now, "(" + (desktopCause ?? "KWin") + ")");
    lastDesktopLabel = now;
}
