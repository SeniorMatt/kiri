class MockKGlobalAccel {
    public onPressed: ((name: string) => void)|null = null;
    public onRepeated: ((name: string) => void)|null = null;
    public readonly registered = new Map<string, number[]>();
    public readonly lastFlags = new Map<string, number>();
    private readonly stored = new Map<string, number[]>(); // like kglobalshortcutsrc

    public call(path: string, iface: string, member: string, types: string[], args: any[], resolve: (value: any) => void) {
        switch (member) {
        case "doRegister":
            this.registered.set(args[0][1], []);
            resolve(undefined);
            break;
        case "setShortcut": {
            const name = args[0][1];
            const flags = args[2];
            this.lastFlags.set(name, flags);
            if (flags & 8) { // IsDefault: only sets the default keys
                resolve(args[1]);
                break;
            }
            if (flags & 4 || !this.stored.has(name)) { // NoAutoloading, or nothing stored yet
                this.stored.set(name, args[1]);
            }
            this.registered.set(name, this.stored.get(name)!);
            resolve(this.stored.get(name));
            break;
        }
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

    // a held key: kglobalacceld emits globalShortcutRepeated
    public repeat(name: string) {
        Assert.assert(this.registered.has(name), { message: "unknown shortcut " + name });
        this.onRepeated?.(name);
    }
}
