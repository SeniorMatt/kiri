namespace FocusPassing {
    export const enum Type {
        None,
        Immediate,
        OnUnfocus,
    }

    export class Passer {
        private currentRequest: Request | null = null;
        private retries = 0;
        // KWin does not always say that it dropped the focus (a closing full-screen window may leave nothing focused
        // without a signal that comes in time), so while a request is open it is also checked on a timer
        private readonly retryTimer = new Delayer(Passer.retryMs, () => this.retry());
        private static readonly retryMs = 50;
        private static readonly maxRetries = 4;

        public request(target: KwinClient) {
            this.currentRequest = new Request(target, Date.now());
            this.retries = 0;
            this.retryTimer.run();
        }

        public clear() {
            this.currentRequest = null;
            this.retryTimer.stop();
        }

        private retry() {
            if (this.currentRequest === null) {
                return;
            }
            if (Workspace.activeWindow === this.currentRequest.target) {
                this.clear(); // done
                return;
            }
            if (Workspace.activeWindow === null) {
                this.activate();
            }
            // a request that waits for the focus to leave a window (OnUnfocus) is still open
            if (this.currentRequest !== null && ++this.retries < Passer.maxRetries) {
                this.retryTimer.run();
            }
        }

        public destroy() {
            this.clear();
            this.retryTimer.destroy();
        }

        public clearIfDifferent(kwinClient: KwinClient) {
            if (this.currentRequest !== null && this.currentRequest.target !== kwinClient) {
                this.clear();
            }
        }

        public activate() {
            if (this.currentRequest === null) {
                return;
            }

            const target = this.currentRequest.target;
            if (this.currentRequest.isExpired() || !Workspace.windows.includes(target) ||
                (target.desktops.length > 0 && !target.desktops.includes(Workspace.currentDesktop))) {
                // a desktop switch also leaves no window focused for a moment; activating the window from the old
                // desktop then would switch straight back to it
                this.clear();
                return;
            }

            KiriFocus.mark(this.currentRequest.target);
            activateWindow(this.currentRequest.target, "focus-passing");
        }
    }

    class Request {
        private static readonly validMs = 200;

        constructor(
            public readonly target: KwinClient,
            private readonly time: number,
        ) {}

        public isExpired() {
            return Date.now() - this.time > Request.validMs;
        }
    }
}
