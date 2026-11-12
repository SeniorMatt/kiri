class MockKGlobalAccel {
    public onPressed: ((name: string) => void)|null = null;
    public onRepeated: ((name: string) => void)|null = null;
    public onReleased: ((name: string) => void)|null = null;
    public readonly registered = new Map<string, number[]>();
    public readonly lastFlags = new Map<string, number>();
    // KWin's own actions (component "kwin"), as kglobalaccel keeps them: keys and default keys
    public readonly kwinActions = new Map<string, { keys: number[], defaults: number[] }>();
    // actions of other components (Plasma's): "component/action" -> keys
    public readonly otherActions = new Map<string, number[]>();
    // kglobalshortcutsrc, group [kwin]: name -> [current, default, description], keys of an entry joined by a tab
    public readonly rc = new Map<string, string[]>();
    public readonly inactive = new Set<string>();
    public readonly failing = new Set<string>(); // D-Bus members whose call fails (the reply is undefined)
    private readonly stored = new Map<string, number[]>(); // like kglobalshortcutsrc

    public call(path: string, iface: string, member: string, types: string[], args: any[], resolve: (value: any) => void) {
        if (this.failing.has(member)) {
            resolve(undefined);
            return;
        }
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
        case "getGlobalShortcutsByKey": {
            const infos: string[][] = [];
            this.kwinActions.forEach((action, name) => action.keys.includes(args[0]) && infos.push([name, "", "kwin", ""]));
            this.otherActions.forEach((keys, id) => keys.includes(args[0]) && infos.push([id.split("/")[1], "", id.split("/")[0], ""]));
            resolve(infos);
            break;
        }
        case "shortcutNames":
            resolve(Array.from(this.kwinActions.keys()));
            break;
        case "shortcut":
            resolve(this.kwinActions.get(args[0][1])?.keys ?? []);
            break;
        case "defaultShortcut":
            resolve(this.kwinActions.get(args[0][1])?.defaults ?? []);
            break;
        case "setForeignShortcut":
            this.kwinActions.get(args[0][1])!.keys = args[1];
            resolve(undefined);
            break;
        case "setInactive":
            this.inactive.add(args[0][0] + "/" + args[0][1]);
            resolve(undefined);
            break;
        default:
            resolve(undefined);
        }
    }

    public press(name: string) {
        Assert.assert(this.registered.has(name), { message: "unknown shortcut " + name });
        this.onPressed?.(name);
    }

    public release(name: string) {
        this.onReleased?.(name);
    }

    // a held key: kglobalacceld emits globalShortcutRepeated
    public repeat(name: string) {
        Assert.assert(this.registered.has(name), { message: "unknown shortcut " + name });
        this.onRepeated?.(name);
    }
}
