namespace FocusPassing {
    export const enum Type {
        None,
        Immediate,
        OnUnfocus,
    }

    export class Passer {
        private currentRequest: Request | null = null;

        public request(target: KwinClient) {
            this.currentRequest = new Request(target, Date.now());
        }

        public clear() {
            this.currentRequest = null;
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
            if (this.currentRequest.isExpired() ||
                (target.desktops.length > 0 && !target.desktops.includes(Workspace.currentDesktop))) {
                // a desktop switch also leaves no window focused for a moment; activating the window from the old
                // desktop then would switch straight back to it
                this.clear();
                return;
            }

            KiriFocus.mark(this.currentRequest.target);
            Workspace.activeWindow = this.currentRequest.target;
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
