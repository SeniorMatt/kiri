// Remembers which window Kiri itself is focusing (a key action, focus passed on when a window closes, a new
// window), so the cursor only follows those focus changes, like niri's warp-mouse-to-focus. Focus that comes from
// the pointer or from an app activating itself (e.g. a chat app raising itself when a file is dropped on it)
// must not move the cursor.
namespace KiriFocus {
    const validMs = 500;
    let target: KwinClient|null = null;
    let time = 0;

    export function mark(kwinClient: KwinClient) {
        target = kwinClient;
        time = Date.now();
    }

    export function take(kwinClient: KwinClient) {
        const result = target === kwinClient && Date.now() - time <= validMs;
        if (target === kwinClient) {
            target = null;
        }
        return result;
    }
}
