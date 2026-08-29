import QtQuick 6.0
import org.kde.plasma.workspace.dbus as DBus

// Talks to kglobalaccel, KDE's global shortcut service. Kiri registers its shortcuts there itself
// (instead of through KWin's ShortcutHandler) so they get their own "Kiri" group in the Shortcuts settings.
QtObject {
    id: bridge

    property var onPressed: null

    function wrap(type, value) {
        switch (type) {
        case "s": return new DBus.string(value);
        case "i": return new DBus.int32(value);
        case "u": return new DBus.uint32(value);
        case "as": return value.map(v => new DBus.string(v));
        case "ai": return value.map(v => new DBus.int32(v));
        }
        throw new Error("unsupported D-Bus type " + type);
    }

    function unwrap(value) {
        if (Array.isArray(value)) {
            return value.map(v => bridge.unwrap(v));
        }
        if (value !== null && typeof value === "object" && "value" in value) {
            return bridge.unwrap(value.value);
        }
        return value;
    }

    function call(path, iface, member, types, args, resolve) {
        DBus.SessionBus.asyncCall(
            {
                service: "org.kde.kglobalaccel",
                path: path,
                iface: iface,
                member: member,
                arguments: args.map((arg, i) => bridge.wrap(types[i], arg)),
                signature: "(" + types.join("") + ")",
            },
            (reply) => resolve(bridge.unwrap(reply.value)),
            (error) => {
                console.log("Kiri: kglobalaccel", member, "failed:", error && error.error ? error.error.message : error);
                resolve(undefined);
            },
        );
    }

    property DBus.SignalWatcher watcher: DBus.SignalWatcher {
        busType: DBus.BusType.Session
        service: "org.kde.kglobalaccel"
        path: "/component/kiri"
        iface: "org.kde.kglobalaccel.Component"

        function dbusglobalShortcutPressed(component, shortcut, timestamp) {
            if (bridge.onPressed !== null) {
                bridge.onPressed(String(shortcut));
            }
        }
    }
}
