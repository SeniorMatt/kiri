tests.register("Decorations: settings, tab indicator geometry, window overrides", 10, () => {
    // defaults are niri's
    const config = getDefaultConfig();
    Assert.equal(config.shadowEnabled, false);
    Assert.equal(config.shadowOffsetX, 0);
    Assert.equal(config.shadowOffsetY, 5);
    Assert.equal(config.shadowSoftness, 30);
    Assert.equal(config.shadowSpread, 5);
    Assert.equal(config.shadowColor, "#00000077");
    Assert.equal(config.focusRingUrgentColor, "#9b0000");
    Assert.equal(config.insertHintColor, "#7fc8ff80");
    Assert.equal(config.fullscreenBackdropColor, "#000000");
    Assert.equal(config.tabIndicatorGapsBetweenTabs, 0);
    Assert.equal(config.tabIndicatorPlaceWithinColumn, false);

    // niri's tab_rects: three tabs left of a column, default settings; the 0.5 length of a 800 px column is 400 px, of which
    // niri's px_per_tab keeps 398 (it counts a 1 px gap between tabs it then does not have)
    const rects = Column.tabRects(config, 3, 100, 50, 400, 800);
    Assert.equal(rects.length, 3);
    Assert.equal(rects[0].x, 100 - 5 - 4);
    Assert.equal(rects[0].width, 4);
    Assert.equal(rects[0].y, 50 + 201);
    Assert.equal(rects.map(r => r.height).join(","), "133,133,132");
    Assert.equal(rects[1].y, rects[0].y + rects[0].height);
    // tabs on the right, gaps between the tabs
    const spaced = Object.assign({}, config, { tabIndicatorPosition: "right", tabIndicatorGapsBetweenTabs: 6, tabIndicatorLength: 1 });
    const right = Column.tabRects(spaced, 2, 0, 0, 400, 800);
    Assert.equal(right[0].x, 405);
    Assert.equal(right[1].y - (right[0].y + right[0].height), 6);
    Assert.equal(right[0].y, 0);
    // top: the strip runs along the top edge; a negative gap puts it over the window
    const top = Column.tabRects(Object.assign({}, config, { tabIndicatorPosition: "top", tabIndicatorGap: -2, tabIndicatorLength: 2 }), 2, 0, 0, 400, 800);
    Assert.equal(top[0].y, 2 - 4);
    Assert.equal(top[0].x, -200); // length 2 is twice the side, centred
    Assert.equal(top[1].x + top[1].width, 599); // niri: 2 x 399.5 px of the 800 px (it counts a 1 px gap between tabs it then does not have)

    // a window that asks for attention is told to the effect, and the global look as JSON
    setRingConfig(config);
    const json = JSON.parse(lastDecorationsConfigJson);
    Assert.equal(json.shadowSoftness, 30);
    Assert.equal(json.focusRingActiveColor, "#7fc8ff");
    Assert.equal(json.tabIndicatorGapsBetweenTabs, 0);
    Assert.equal(json.niriConfig, undefined);

    const { workspaceMock } = init(getDefaultConfig());
    const [a] = workspaceMock.createClients(1);
    a.demandsAttention = true;
    Assert.equal(lastUrgentWindowsJson, JSON.stringify([String(a.internalId)]));
    a.demandsAttention = false;
    Assert.equal(lastUrgentWindowsJson, "[]");

    // per-window overrides are handed to the effect as they come, and are gone with the window
    setWindowDecorations("{x}", { shadow: { enabled: true, softness: 10 }, cornerRadius: 3 });
    Assert.equal(JSON.parse(lastWindowDecorationsJson)["{x}"].shadow.softness, 10);
    setWindowDecorations("{x}", null);
    Assert.equal(lastWindowDecorationsJson, "{}");
});

tests.register("Decorations: tab indicator placed within the column", 10, () => {
    for (const position of ["left", "right", "top", "bottom"]) {
        const config = getDefaultConfig();
        config.tabIndicatorPlaceWithinColumn = true;
        config.tabIndicatorPosition = position;
        const { qtMock, workspaceMock } = init(config);
        const [a, b] = workspaceMock.createClients(2);
        workspaceMock.activeWindow = b;
        qtMock.fireShortcut("window-move-left");
        qtMock.fireShortcut("column-toggle-tabbed");
        const frame = a.getActualFrameGeometry();
        // the tab indicator (width 4, gap 5) takes 9 px from the column
        const extra = 9;
        const full = tilingArea.width - 0; // one column of both windows, as wide as it was
        const before = b.getActualFrameGeometry();
        Assert.equalRects(frame, before);
        if (position === "left" || position === "right") {
            Assert.equal(tilingArea.height, frame.height);
            Assert.equal(frame.width + extra <= full, true);
        } else {
            Assert.equal(frame.height, tilingArea.height - extra);
        }
        // not tabbed again: the windows have the whole column
        qtMock.fireShortcut("column-toggle-tabbed");
        const stacked = a.getActualFrameGeometry();
        Assert.equal(stacked.width >= frame.width, true);
    }

    // within the column is off by default: the tabs are beside the windows, the windows keep the whole area
    const config = getDefaultConfig();
    const { qtMock, workspaceMock } = init(config);
    const [a, b] = workspaceMock.createClients(2);
    workspaceMock.activeWindow = b;
    qtMock.fireShortcut("window-move-left");
    qtMock.fireShortcut("column-toggle-tabbed");
    Assert.equal(a.getActualFrameGeometry().height, tilingArea.height);
    // hide-when-single-tab: no room taken from a single tab
    const single = getDefaultConfig();
    single.tabIndicatorPlaceWithinColumn = true;
    single.tabIndicatorHideWhenSingleTab = true;
    const mock = init(single);
    const [lone] = mock.workspaceMock.createClients(1);
    mock.qtMock.fireShortcut("column-toggle-tabbed");
    Assert.equal(lone.getActualFrameGeometry().height, tilingArea.height);
});

tests.register("Decorations: niri config import", 5, () => {
    const result = NiriImport.parse(`
        layout {
            focus-ring {
                active-gradient from="#80c8ff" to="#bbddff" angle=45 relative-to="workspace-view" in="oklch longer hue"
                inactive-color "rgba(80, 80, 80, 0.5)"
                urgent-color "#ff0000"
            }
            border { on; urgent-gradient from="red" to="blue" }
            shadow { on; offset x=2 y=-3; softness 20; spread 7; draw-behind-window true; color "#0007"; inactive-color "#00000040" }
            insert-hint { color "#ff000080"; gradient from="#f00" to="#00f" angle=90 }
            tab-indicator {
                place-within-column
                gaps-between-tabs 3
                corner-radius 2
                active-color "#00ff00"
                urgent-gradient from="#ff0000" to="#0000ff"
            }
            fullscreen-backdrop-color "transparent"
            background-color "#112233"
        }
    `);
    const s = result.settings;
    Assert.equal(s["focusRingActiveColor"], undefined);
    Assert.equal(s["focusRingActiveGradient"], "from=#80c8ff to=#bbddff angle=45 relative-to=workspace-view in=oklch longer hue");
    Assert.equal(s["focusRingInactiveColor"], "#50505080");
    Assert.equal(s["focusRingUrgentColor"], "#ff0000");
    Assert.equal(s["borderEnabled"], true);
    Assert.equal(s["borderUrgentGradient"], "from=#ff0000 to=#0000ff");
    Assert.equal(s["shadowEnabled"], true);
    Assert.equal(s["shadowOffsetX"], 2);
    Assert.equal(s["shadowOffsetY"], -3);
    Assert.equal(s["shadowSoftness"], 20);
    Assert.equal(s["shadowSpread"], 7);
    Assert.equal(s["shadowDrawBehindWindow"], true);
    Assert.equal(s["shadowColor"], "#00000077");
    Assert.equal(s["shadowInactiveColor"], "#00000040");
    Assert.equal(s["insertHintColor"], "#ff000080");
    Assert.equal(s["insertHintGradient"], "from=#ff0000 to=#0000ff angle=90");
    Assert.equal(s["tabIndicatorPlaceWithinColumn"], true);
    Assert.equal(s["tabIndicatorGapsBetweenTabs"], 3);
    Assert.equal(s["tabIndicatorCornerRadius"], 2);
    Assert.equal(s["tabIndicatorActiveColor"], "#00ff00");
    Assert.equal(s["tabIndicatorUrgentGradient"], "from=#ff0000 to=#0000ff");
    Assert.equal(s["fullscreenBackdropColor"], "#00000000");
    Assert.equal(s["backgroundColor"], "#112233");
    Assert.equal(result.skipped.length, 0);
    Assert.equal(NiriImport.parseColor("#abc"), "#aabbcc");
    Assert.equal(NiriImport.parseColor("#aabbccff"), "#aabbcc");
    Assert.equal(NiriImport.parseColor("rgb(255, 0, 0)"), "#ff0000");
    Assert.equal(NiriImport.parseColor("hsl(0, 100%, 50%)"), "#ff0000");
});
