class MockKGlobalAccel {
    public onPressed: ((name: string) => void)|null = null;
    public readonly registered = new Map<string, number[]>();
    public readonly lastFlags = new Map<string, number>();

    public call(path: string, iface: string, member: string, types: string[], args: any[], resolve: (value: any) => void) {
        switch (member) {
        case "doRegister":
            this.registered.set(args[0][1], []);
            resolve(undefined);
            break;
        case "setShortcut":
            this.registered.set(args[0][1], args[1]);
            this.lastFlags.set(args[0][1], args[2]);
            resolve(args[1]);
            break;
        case "getGlobalShortcutsByKey":
        case "shortcutNames":
            resolve([]);
            break;
        default:
            resolve(undefined);
        }
    }

    public press(name: string) {
        Assert.assert(this.registered.has(name), { message: "unknown shortcut " + name });
        this.onPressed?.(name);
    }
}
