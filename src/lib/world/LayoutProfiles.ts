// niri's per-workspace and per-output `layout {}` (niri-config/src/workspace.rs WorkspaceLayoutPart, output.rs). niri
// merges them over the global layout in this order (layout/monitor.rs with_merged_layout, workspace.rs 230):
// global layout, then the output's layout, then the workspace's layout; the later one wins field by field.
//
// Both settings are JSON objects of Kiri's own config keys, the same names the settings page uses:
//   desktopLayouts:  { "web": { "gapsInnerHorizontal": 0, "presetWidths": "1/3, 2/3" } }          (key: the desktop's name)
//   outputOverrides: { "DP-1": { "layout": { ... same keys ... }, "backdropColor": "#101010",
//                                "hotCorners": { "enabled": true, "topLeft": false, "bottomRight": true } } }
// An output is named by its connector ("DP-1") or by "Make Model Serial", compared without case, like niri does.
// Only the keys of niri's LayoutPart count (LayoutProfiles.KEYS); the others are dropped. niri's workspace layout does not
// take empty-workspace-above-first or insert-hint; Kiri's output layouts do not either (both are global here).
interface LayoutProfile {
    desktop: Desktop.Config;
    layout: LayoutConfig;
    presetWidths: { cycle: (column: Column, forwards: boolean) => void, getWidths: (minWidth: number, maxWidth: number, tilingAreaWidth: number) => number[] };
    presetHeights: { getOrdered: (tilingAreaHeight: number) => number[] };
    columnResizer: Actions.ColumnResizer;
    defaultColumnWidth: ((tilingAreaWidth: number) => number) | null;
    // the appearance keys of the layout, as the per-window look of the decorations effect; null when none is set
    look: WindowDecorationRule | null;
    fullscreenBackdropColor: string | undefined;
    backgroundColor: string | undefined;
}

class LayoutProfiles {
    // the keys of niri's LayoutPart that Kiri can apply per desktop and output
    public static readonly KEYS = /^(gapsInnerHorizontal|gapsInnerVertical|gapsOuter(Top|Bottom|Left|Right)|presetWidths|presetHeights|defaultColumnWidth|scrolling(Lazy|Centered|Grouped|OnOverflow)|alwaysCenterSingleColumn|tabbedColumnsByDefault|tabIndicator.*|focusRing.*|border.*|shadow.*|backgroundColor|fullscreenBackdropColor)$/;
    private static readonly LOOK_BANDS = ["focusRing", "border"] as const;

    private readonly base: LayoutProfile;
    private readonly desktops = new Map<string, Record<string, any>>(); // lower case name -> keys
    private readonly outputs: { id: string, layout: Record<string, any> }[] = []; // lower case id
    private readonly cache = new Map<string, LayoutProfile>();

    constructor(private readonly config: Config, private readonly build: (config: Config) => LayoutProfile) {
        this.base = build(config);
        const desktopLayouts = LayoutProfiles.parseObject(config.desktopLayouts);
        for (const name of Object.keys(desktopLayouts)) {
            this.desktops.set(name.toLowerCase(), LayoutProfiles.pick(desktopLayouts[name]));
        }
        const outputOverrides = LayoutProfiles.parseObject(config.outputOverrides);
        for (const id of Object.keys(outputOverrides)) {
            const entry = outputOverrides[id];
            if (entry !== null && typeof entry === "object") {
                this.outputs.push({ id: id.toLowerCase(), layout: LayoutProfiles.pick(entry.layout) });
            }
        }
    }

    public static parseObject(text: string): Record<string, any> {
        if (text.trim() === "") {
            return {};
        }
        try {
            const parsed = JSON.parse(text);
            return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch (error: any) {
            log("failed to parse a layout override:", error);
            return {};
        }
    }

    private static pick(layout: any): Record<string, any> {
        const result: Record<string, any> = {};
        if (layout !== null && typeof layout === "object") {
            for (const key of Object.keys(layout)) {
                if (LayoutProfiles.KEYS.test(key)) {
                    result[key] = layout[key];
                }
            }
        }
        return result;
    }

    public isEmpty() {
        return this.desktops.size === 0 && this.outputs.length === 0;
    }

    public getBase() {
        return this.base;
    }

    // the layout of a desktop on an output; `outputIds` are the names the output answers to
    public resolve(desktopName: string, outputIds: string[]): LayoutProfile {
        if (this.isEmpty()) {
            return this.base;
        }
        const ids = outputIds.map(id => id.toLowerCase());
        const key = desktopName.toLowerCase() + "|" + ids.join("|");
        const cached = this.cache.get(key);
        if (cached !== undefined) {
            return cached;
        }
        let merged: Record<string, any> = {};
        for (const output of this.outputs) {
            if (ids.includes(output.id)) {
                merged = Object.assign(merged, output.layout);
                break; // niri uses the first output block that matches
            }
        }
        merged = Object.assign(merged, this.desktops.get(desktopName.toLowerCase()) ?? {});
        let profile = this.base;
        if (Object.keys(merged).length > 0) {
            profile = this.build(Object.assign({}, this.config, merged));
            profile.look = LayoutProfiles.lookOf(merged);
            profile.fullscreenBackdropColor = merged["fullscreenBackdropColor"];
            profile.backgroundColor = merged["backgroundColor"];
        }
        this.cache.set(key, profile);
        return profile;
    }

    // true when some override sets one of the appearance keys of the windows
    public hasLooks() {
        const sets = [...this.desktops.values(), ...this.outputs.map(output => output.layout)];
        return sets.some(set => Object.keys(set).some(key => /^(focusRing|border|shadow|tabIndicator(Active|Inactive|Urgent)|fullscreenBackdrop)/.test(key)));
    }

    // the keys in `config`-style names to a WindowDecorationRule (Kiri.ts); the colours of the tab indicator only
    // (its geometry is the script's own, see Desktop)
    private static lookOf(set: Record<string, any>): WindowDecorationRule | null {
        const rule: Record<string, any> = {};
        const take = (group: string, prefix: string, fields: string[]) => {
            const out: Record<string, any> = {};
            for (const field of fields) {
                const value = set[prefix + field.charAt(0).toUpperCase() + field.slice(1)];
                if (value !== undefined) {
                    out[field] = value;
                }
            }
            if (Object.keys(out).length > 0) {
                rule[group] = out;
            }
        };
        const bandFields = ["enabled", "width", "activeColor", "inactiveColor", "urgentColor", "activeGradient", "inactiveGradient", "urgentGradient"];
        for (const band of LayoutProfiles.LOOK_BANDS) {
            take(band, band, bandFields);
        }
        take("shadow", "shadow", ["enabled", "offsetX", "offsetY", "softness", "spread", "drawBehindWindow", "color", "inactiveColor"]);
        take("tabIndicator", "tabIndicator", ["activeColor", "inactiveColor", "urgentColor", "activeGradient", "inactiveGradient", "urgentGradient"]);
        if (set["fullscreenBackdropColor"] !== undefined) {
            rule["fullscreenBackdropColor"] = set["fullscreenBackdropColor"];
        }
        return Object.keys(rule).length === 0 ? null : rule as WindowDecorationRule;
    }

    // the names an output answers to in the settings: its connector, and niri's "make model serial"
    public static outputIds(screen: Output | undefined, name: string): string[] {
        const ids = [name];
        const s = screen as any;
        if (s !== undefined && s !== null && (s.manufacturer || s.model || s.serialNumber)) {
            ids.push([s.manufacturer, s.model, s.serialNumber].map(part => part ? String(part) : "Unknown").join(" "));
        }
        return ids;
    }
}
