namespace Clients {
    const prohibitedClasses = [
        "ksmserver-logout-greeter",
        "xwaylandvideobridge",
    ];

    export function isProhibitedClass(kwinClient: KwinClient) {
        return prohibitedClasses.includes(kwinClient.resourceClass);
    }

    // Plasma's own windows (notifications, OSDs, KRunner, the launcher and other popups) put themselves where they
    // belong, e.g. next to the panel, and the default window rules make them float, so Kiri must not move them
    export function placesItself(kwinClient: KwinClient) {
        return !(kwinClient.normalWindow || kwinClient.dialog) || !kwinClient.moveable ||
            /^(org\.kde\.)?(plasmashell|krunner)$/.test(kwinClient.resourceClass);
    }

    export function canTileEver(kwinClient: KwinClient) {
        const shapeable = (kwinClient.moveable && kwinClient.resizeable) || kwinClient.fullScreen; // full-screen windows may become shapeable after exiting full-screen mode
        return shapeable &&
            !kwinClient.popupWindow &&
            !prohibitedClasses.includes(kwinClient.resourceClass);
    }

    export function canTileNow(kwinClient: KwinClient) {
        return canTileEver(kwinClient) &&
            !kwinClient.minimized &&
            kwinClient.desktops.length === 1 &&
            kwinClient.activities.length === 1;
    }

    export function makeTileable(kwinClient: KwinClient) {
        if (kwinClient.minimized) {
            kwinClient.minimized = false;
        }
        if (kwinClient.desktops.length !== 1) {
            kwinClient.desktops = [Workspace.currentDesktop];
        }
        if (kwinClient.activities.length !== 1) {
            kwinClient.activities = [Workspace.currentActivity];
        }
    }

    export function getKwinDesktopApprox(kwinClient: KwinClient) {
        switch (kwinClient.desktops.length) {
        case 0:
            return Workspace.currentDesktop;
        case 1:
            return kwinClient.desktops[0];
        default:
            if (kwinClient.desktops.includes(Workspace.currentDesktop)) {
                return Workspace.currentDesktop;
            } else {
                return kwinClient.desktops[0];
            }
        }
    }

    export function isFullScreenGeometry(kwinClient: KwinClient) {
        const fullScreenArea = Workspace.clientArea(ClientAreaOption.FullScreenArea, kwinClient.output, getKwinDesktopApprox(kwinClient));
        return kwinClient.clientGeometry.width.round() >= fullScreenArea.width &&
            kwinClient.clientGeometry.height.round() >= fullScreenArea.height;
    }

    // right after a window leaves full-screen mode its frame still covers the screen, but the title bar is back,
    // so `isFullScreenGeometry` is already false: such a frame is KWin's, not the size the window wants to tile at
    export function isFrameFullScreenSize(kwinClient: KwinClient) {
        const fullScreenArea = Workspace.clientArea(ClientAreaOption.FullScreenArea, kwinClient.output, getKwinDesktopApprox(kwinClient));
        return kwinClient.frameGeometry.width.round() >= fullScreenArea.width &&
            kwinClient.frameGeometry.height.round() >= fullScreenArea.height;
    }

    export function isOnVirtualDesktop(kwinClient: KwinClient, kwinDesktop: KwinDesktop) {
        return kwinClient.desktops.length === 0 || kwinClient.desktops.includes(kwinDesktop);
    }

    export function isOnOneOfVirtualDesktops(kwinClient: KwinClient, kwinDesktops: KwinDesktop[]) {
        return kwinClient.desktops.length === 0 || kwinClient.desktops.some(d => kwinDesktops.includes(d));
    }
}
