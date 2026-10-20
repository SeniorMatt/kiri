function log(...args: any[]) {
    console.log("Kiri:", ...args);
}

// Every change of the current desktop goes to the journal: "Kiri: desktop 1 -> 2 (swipe)" when Kiri did it,
// "(KWin)" when something else did (a KWin gesture, the pager, a shortcut Kiri does not own).
let desktopCause: string|null = null;
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

function logDesktopChange() {
    const now = desktopLabel(Workspace.currentDesktop);
    if (now === lastDesktopLabel) {
        return;
    }
    log("desktop", lastDesktopLabel ?? "?", "->", now, "(" + (desktopCause ?? "KWin") + ")");
    lastDesktopLabel = now;
}
