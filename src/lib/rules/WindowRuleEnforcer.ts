// what the dynamic matchers (is-floating, is-active, is-focused, ...) ask about a window; a missing answer is "no"
interface WindowRuleContext {
    isFloating(kwinClient: KwinClient): boolean;
    isActive(kwinClient: KwinClient): boolean;
    isFocused(kwinClient: KwinClient): boolean;
    isActiveInColumn?(kwinClient: KwinClient): boolean;
    isUrgent?(kwinClient: KwinClient): boolean;
    atStartup?(): boolean;
}

const kiriStartedAt = Date.now();
const atStartupMs = 60000;

class RuleMatcher {
    private readonly matcher: ClientMatcher | null;
    private readonly appId: RegExp | null;
    private readonly title: RegExp | null;
    private readonly excludes: RuleMatcher[];

    constructor(
        private readonly match: WindowMatch,
        excludes: WindowMatch[],
        private readonly context: WindowRuleContext,
    ) {
        this.matcher = match.class === undefined && match.caption === undefined ?
            null :
            new ClientMatcher(WindowRuleEnforcer.joinRegexes([WindowRuleEnforcer.getRuleString(match)]));
        this.appId = match.appId === undefined ? null : RustRegex.compile(match.appId);
        this.title = match.title === undefined ? null : RustRegex.compile(match.title);
        this.excludes = excludes.map(exclude => new RuleMatcher(exclude, [], context));
    }

    public isDynamic(): boolean {
        const match = this.match;
        return match.isFloating !== undefined || match.isActive !== undefined || match.isFocused !== undefined ||
            match.isActiveInColumn !== undefined || match.isUrgent !== undefined || match.atStartup !== undefined ||
            this.excludes.some(exclude => exclude.isDynamic());
    }

    public usesAtStartup(): boolean {
        return this.match.atStartup !== undefined || this.excludes.some(exclude => exclude.usesAtStartup());
    }

    public usesText(): boolean {
        return this.matcher !== null || this.appId !== null || this.title !== null || this.excludes.some(exclude => exclude.usesText());
    }

    // `opening`: niri evaluates the rules of a window that is being opened as if it were not focused, active, urgent or
    // floating
    public matches(kwinClient: KwinClient, opening = false): boolean {
        const match = this.match;
        const context = this.context;
        return (this.matcher === null || this.matcher.matches(kwinClient)) &&
            (this.appId === null || (kwinClient.resourceClass !== "" && this.appId.test(kwinClient.resourceClass))) && // a window without an app id or title matches no regex, like niri
            (this.title === null || (kwinClient.caption !== "" && this.title.test(kwinClient.caption))) &&
            (match.isFloating === undefined || match.isFloating === (!opening && context.isFloating(kwinClient))) &&
            (match.isActive === undefined || match.isActive === (!opening && context.isActive(kwinClient))) &&
            (match.isFocused === undefined || match.isFocused === (!opening && context.isFocused(kwinClient))) &&
            (match.isActiveInColumn === undefined || match.isActiveInColumn === (opening || context.isActiveInColumn === undefined || context.isActiveInColumn(kwinClient))) &&
            (match.isUrgent === undefined || match.isUrgent === (!opening && context.isUrgent !== undefined && context.isUrgent(kwinClient))) &&
            (match.isWindowCastTarget === undefined || match.isWindowCastTarget === false) &&
            (match.atStartup === undefined || match.atStartup === (context.atStartup !== undefined ? context.atStartup() : Date.now() - kiriStartedAt < atStartupMs)) &&
            !this.excludes.some(exclude => exclude.matches(kwinClient, opening));
    }
}

interface RuleEntry {
    matcher: RuleMatcher;
    rule: WindowRule;
}

const noWindowRuleContext: WindowRuleContext = {
    isFloating: () => false,
    isActive: () => false,
    isFocused: () => false,
};

// the rules of one window merged in order of appearance: the last rule that sets a property wins
interface ResolvedRules {
    tile?: boolean;
    width?: string;
    height?: string;
    fullscreen?: boolean;
    maximized?: boolean;
    maximizedToEdges?: boolean;
    focused?: boolean;
    workspace?: string;
    columnDisplay?: "normal" | "tabbed";
    floatingPosition?: FloatingPositionRule;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    opacity?: number;
    style: WindowDecorationRule;
}

const plainRuleKeys = [
    "tile", "width", "height", "fullscreen", "maximized", "maximizedToEdges", "focused", "workspace", "columnDisplay",
    "floatingPosition", "minWidth", "minHeight", "maxWidth", "maxHeight", "opacity",
] as const;
const plainStyleKeys = ["cornerRadius", "drawBorderWithBackground", "babaIsFloat"] as const;
const mergedStyleKeys = ["focusRing", "border", "shadow", "tabIndicator"] as const;

class WindowRuleEnforcer {
    private readonly entries: RuleEntry[];
    private readonly followCaption: RegExp;
    private readonly dynamic: boolean;
    private readonly startup: boolean;
    private readonly text: boolean;

    private readonly gapsInnerHorizontal: number;
    private readonly defaultWidth: ((tilingAreaWidth: number) => number) | null;

    constructor(
        windowRules: WindowRule[],
        private readonly tileFullScreen: boolean,
        defaultColumnWidth = "",
        gapsInnerHorizontal = 0,
        context: WindowRuleContext = noWindowRuleContext,
        private readonly gapsInnerVertical = 0,
    ) {
        this.gapsInnerHorizontal = gapsInnerHorizontal;
        this.entries = [];
        for (const rule of windowRules) {
            try {
                this.entries.push({ matcher: new RuleMatcher(rule, rule.exclude ?? [], context), rule });
            } catch (error: any) {
                log("invalid window rule:", JSON.stringify(rule), error);
            }
        }
        for (const entry of this.entries) {
            for (const key of ["width", "height"] as const) {
                const size = entry.rule[key];
                if (size !== undefined && size !== "") {
                    try {
                        PresetWidths.parseWidth(size, 0);
                    } catch (error: any) {
                        log(`invalid ${key} in window rule:`, size, error);
                        delete entry.rule[key];
                    }
                }
            }
        }
        this.defaultWidth = null;
        if (defaultColumnWidth.trim() !== "") {
            try {
                this.defaultWidth = PresetWidths.parseWidth(defaultColumnWidth, gapsInnerHorizontal);
            } catch (error: any) {
                log("invalid defaultColumnWidth:", defaultColumnWidth, error);
            }
        }
        this.dynamic = this.entries.some(entry => entry.matcher.isDynamic());
        this.startup = this.entries.some(entry => entry.matcher.usesAtStartup());
        this.text = this.entries.some(entry => entry.matcher.usesText());
        this.followCaption = WindowRuleEnforcer.createFollowCaptionRegex(this.entries.map(entry => entry.rule));
    }

    public hasDynamicRules() {
        return this.dynamic;
    }

    public hasStartupRules() {
        return this.startup;
    }

    public static startupRemainingMs() {
        return Math.max(0, kiriStartedAt + atStartupMs - Date.now());
    }

    // niri's ResolvedWindowRules::compute
    public resolve(kwinClient: KwinClient, opening = false): ResolvedRules {
        const resolved: ResolvedRules = { style: {} };
        const out = resolved as any;
        const style = resolved.style as any;
        for (const entry of this.entries) {
            if (!entry.matcher.matches(kwinClient, opening)) {
                continue;
            }
            const rule = entry.rule as any;
            for (const key of plainRuleKeys) {
                if (rule[key] !== undefined) {
                    out[key] = rule[key];
                }
            }
            for (const key of plainStyleKeys) {
                if (rule[key] !== undefined) {
                    style[key] = rule[key];
                }
            }
            for (const key of mergedStyleKeys) {
                if (rule[key] !== undefined) {
                    style[key] = WindowRuleEnforcer.mergeLook(style[key], rule[key]);
                }
            }
        }
        return resolved;
    }

    // niri's merge of a rule into the ones before it: a field replaces the same field, a colour replaces a gradient and
    // the other way round
    private static mergeLook(base: any, part: any) {
        const merged = Object.assign({}, base);
        for (const key of Object.keys(part)) {
            const paint = /^(active|inactive|urgent)(Color|Gradient)$/.exec(key);
            if (paint !== null) {
                delete merged[paint[1] + (paint[2] === "Color" ? "Gradient" : "Color")];
            }
            merged[key] = part[key];
        }
        return merged;
    }

    private preferTilingOf(resolved: ResolvedRules) {
        return resolved.tile === true;
    }

    private preferFloatingOf(resolved: ResolvedRules) {
        return resolved.tile === false;
    }

    // niri's compute_open_floating heuristic: a window with a fixed height opens floating
    public static hasFixedHeight(kwinClient: KwinClient, resolved: ResolvedRules) {
        const min = kwinClient.minSize;
        const max = kwinClient.maxSize;
        if (min === undefined || max === undefined) {
            return false;
        }
        const minHeight = Math.max(Math.ceil(min.height), resolved.minHeight ?? 0);
        let maxHeight = Math.floor(max.height);
        if (resolved.maxHeight !== undefined && resolved.maxHeight > 0) {
            maxHeight = maxHeight <= 0 ? resolved.maxHeight : Math.min(maxHeight, resolved.maxHeight);
        }
        return minHeight > 0 && minHeight === maxHeight;
    }

    public getColumnWidth(kwinClient: KwinClient, tilingAreaWidth: number, resolved = this.resolve(kwinClient), profile?: LayoutProfile): number | null {
        if (resolved.width !== undefined) {
            const width = resolved.width === "" ? null : WindowRuleEnforcer.resolveSize(resolved.width, tilingAreaWidth, profile?.layout.gapsInnerHorizontal ?? this.gapsInnerHorizontal);
            return width;
        }
        const defaultWidth = profile === undefined ? this.defaultWidth : profile.defaultColumnWidth;
        return defaultWidth === null ? null : defaultWidth(tilingAreaWidth);
    }

    public getWindowHeight(kwinClient: KwinClient, tilingAreaHeight: number, resolved = this.resolve(kwinClient), profile?: LayoutProfile): number | null {
        if (resolved.height === undefined || resolved.height === "") {
            return null;
        }
        return WindowRuleEnforcer.resolveSize(resolved.height, tilingAreaHeight, profile?.layout.gapsInnerVertical ?? this.gapsInnerVertical);
    }

    // size of a new window that a float rule matches, in pixels of the work area; null when no float rule matches
    public getFloatingSize(kwinClient: KwinClient, area: QmlRect, resolved = this.resolve(kwinClient)): { width?: number, height?: number } | null {
        if (!this.preferFloatingOf(resolved)) {
            return null;
        }
        return {
            width: WindowRuleEnforcer.resolveFloatingSize(resolved.width, area.width),
            height: WindowRuleEnforcer.resolveFloatingSize(resolved.height, area.height),
        };
    }

    private static resolveFloatingSize(size: string | undefined, available: number): number | undefined {
        if (size === undefined || size === "") {
            return undefined;
        }
        return WindowRuleEnforcer.resolveSize(size, available, 0) ?? undefined;
    }

    public shouldOpenFullScreen(kwinClient: KwinClient, resolved = this.resolve(kwinClient)): boolean {
        return resolved.fullscreen === true;
    }

    private static resolveSize(size: string, available: number, spacing: number): number | null {
        try {
            return PresetWidths.parseWidth(size, spacing)(available);
        } catch (error: any) {
            log("invalid size in window rule:", size, error);
            return null;
        }
    }

    public shouldTile(kwinClient: KwinClient, resolved = this.resolve(kwinClient)) {
        return this.preferTilingOf(resolved) || (
            kwinClient.normalWindow &&
            !kwinClient.transient &&
            !kwinClient.modal &&
            kwinClient.managed &&
            kwinClient.pid > -1 &&
            (!kwinClient.fullScreen || this.tileFullScreen) &&
            !this.preferFloatingOf(resolved) &&
            !WindowRuleEnforcer.hasFixedHeight(kwinClient, resolved)
        );
    }

    public whyNotTiled(kwinClient: KwinClient, resolved = this.resolve(kwinClient)) {
        const reasons: string[] = [];
        if (!(kwinClient.moveable && kwinClient.resizeable) && !kwinClient.fullScreen) {
            reasons.push(`moveable=${kwinClient.moveable} resizeable=${kwinClient.resizeable}`);
        }
        if (kwinClient.popupWindow) {
            reasons.push("popup window");
        }
        if (Clients.isProhibitedClass(kwinClient)) {
            reasons.push("prohibited class");
        }
        if (this.preferTilingOf(resolved)) {
            return reasons.join(", ");
        }
        if (!kwinClient.normalWindow) {
            reasons.push("not a normal window");
        }
        if (kwinClient.transient) {
            reasons.push("transient");
        }
        if (kwinClient.modal) {
            reasons.push("modal");
        }
        if (!kwinClient.managed) {
            reasons.push("not managed");
        }
        if (kwinClient.pid <= -1) {
            reasons.push("no pid");
        }
        if (kwinClient.fullScreen && !this.tileFullScreen) {
            reasons.push("full-screen and tileFullScreen is off");
        }
        if (this.preferFloatingOf(resolved)) {
            reasons.push("a float rule matches");
        }
        if (WindowRuleEnforcer.hasFixedHeight(kwinClient, resolved)) {
            reasons.push("fixed height");
        }
        return reasons.join(", ");
    }

    // niri recomputes the rules when the title, app id or urgency changes; a rule that depends on the caption also moves
    // the window
    public initClientSignalManager(world: World, kwinClient: KwinClient) {
        const follows = this.followCaption.test(kwinClient.resourceClass) || this.followCaption.test(kwinClient.resourceName);
        if (!follows && !this.text && !this.dynamic) {
            return null;
        }

        const enforcer = this;
        const manager = new SignalManager();
        let lastShouldTile = enforcer.shouldTile(kwinClient);
        let lastRules = JSON.stringify(enforcer.resolve(kwinClient));
        const onChanged = () => {
            const ruleResult = follows ? enforcer.shouldTile(kwinClient) : lastShouldTile;
            if (ruleResult === lastShouldTile) {
                const rules = JSON.stringify(enforcer.resolve(kwinClient));
                if (enforcer.dynamic || rules !== lastRules) {
                    lastRules = rules;
                    world.do(clientManager => clientManager.refreshRules(kwinClient));
                }
                return;
            }
            lastShouldTile = ruleResult;
            const shouldTile = Clients.canTileNow(kwinClient) && enforcer.shouldTile(kwinClient);
            world.do((clientManager, desktopManager) => {
                if (!clientManager.wasToggledManually(kwinClient)) {
                    const desktop = desktopManager.getDesktopForClient(kwinClient);
                    if (shouldTile && desktop !== undefined) {
                        clientManager.tileKwinClient(kwinClient, desktop.grid);
                    } else {
                        clientManager.floatKwinClient(kwinClient);
                    }
                }
                clientManager.refreshRules(kwinClient);
            });
        };
        manager.connect(kwinClient.captionChanged, onChanged);
        if (kwinClient.windowClassChanged !== undefined) {
            manager.connect(kwinClient.windowClassChanged, onChanged);
        }
        if (this.dynamic && kwinClient.demandsAttentionChanged !== undefined) {
            manager.connect(kwinClient.demandsAttentionChanged, onChanged);
        }
        return manager;
    }

    private static createFollowCaptionRegex(windowRules: WindowRule[]) {
        const followCaptionRegexes: string[] = [];
        for (const windowRule of windowRules) {
            if (windowRule.tile === undefined) {
                continue;
            }
            const ruleClass = WindowRuleEnforcer.parseRegex(windowRule.class);
            if (WindowRuleEnforcer.parseRegex(windowRule.caption) !== ".*") {
                followCaptionRegexes.push(ruleClass);
            }
        }
        return WindowRuleEnforcer.joinRegexes(followCaptionRegexes);
    }

    public static getRuleString(windowRule: WindowMatch) {
        return ClientMatcher.getRuleString(
            WindowRuleEnforcer.wrapParens(WindowRuleEnforcer.parseRegex(windowRule.class)),
            WindowRuleEnforcer.wrapParens(WindowRuleEnforcer.parseRegex(windowRule.caption)),
        );
    }

    private static parseRegex(rawRule: string | undefined) {
        if (rawRule === undefined || rawRule === "" || rawRule === ".*") {
            return ".*";
        } else {
            return rawRule;
        }
    }

    public static joinRegexes(regexes: string[]) {
        if (regexes.length === 0) {
            return new RegExp("a^"); // match nothing
        }

        if (regexes.length === 1) {
            return new RegExp("^(" + regexes[0] + ")$");
        }

        const joinedRegexes = regexes.map(WindowRuleEnforcer.wrapParens).join("|");
        return new RegExp("^(" + joinedRegexes + ")$");
    }

    private static wrapParens(str: string) {
        return "(" + str + ")";
    }
}
