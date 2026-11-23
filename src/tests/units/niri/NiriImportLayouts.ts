// niri's workspace "x" { layout {} } and output "x" { layout {} background-color backdrop-color hot-corners } become the
// desktopLayouts and outputOverrides settings, in both importers
tests.register("NiriImport: layout {} of workspaces and outputs", 1, () => {
    const fs = require("fs");
    const path = "src/tests/fixtures/niri-layouts.kdl";
    const text = fs.readFileSync(path, "utf8");
    const result = NiriImport.parse(text);
    const desktops = JSON.parse(result.settings["desktopLayouts"]);
    const outputs = JSON.parse(result.settings["outputOverrides"]);

    // only the workspaces that have a layout; gaps 0 over the global 12, the struts of the global layout stay (10)
    Assert.equalArrays(Object.keys(desktops), ["web", "chat"]);
    const web = desktops["web"];
    Assert.equal(web.gapsInnerHorizontal, 0);
    Assert.equal(web.gapsOuterLeft, 10);
    Assert.equal(web.gapsOuterTop, 0);
    Assert.equal(web.defaultColumnWidth, "25%");
    Assert.equal(web.presetWidths, "33.3%, 66.7%");
    Assert.equal(web.scrollingCentered, true);
    Assert.equal(web.alwaysCenterSingleColumn, true);
    Assert.equal(web.focusRingWidth, 1);
    Assert.equal(web.focusRingActiveColor, "#ff0000");
    Assert.equal(web.backgroundColor, "#101010");
    Assert.equal(web.insertHintEnabled, undefined, { message: "insert-hint is not per workspace" });
    Assert.equal(web.emptyDesktopAboveFirst, undefined, { message: "empty-workspace-above-first is not per workspace" });
    // only the struts given: the gap below them (the global 12) stays and is added
    Assert.equal(desktops["chat"].gapsOuterTop, 12 + 20);
    Assert.equal(desktops["chat"].gapsOuterLeft, 12, { message: "struts replace the whole struts of the layout below" });
    Assert.equal(desktops["chat"].gapsInnerHorizontal, undefined);

    Assert.equalArrays(Object.keys(outputs), ["DP-1", "DP-2", "Acme Panel 1234"]);
    Assert.equal(outputs["DP-1"].layout.gapsInnerHorizontal, 4);
    Assert.equal(outputs["DP-1"].layout.gapsOuterLeft, 4 + 10);
    Assert.equal(outputs["DP-1"].layout.tabIndicatorWidth, 8);
    Assert.equal(outputs["DP-1"].layout.tabbedColumnsByDefault, true);
    Assert.equal(outputs["DP-1"].backdropColor, "#202020");
    Assert.equal(JSON.stringify(outputs["DP-1"].hotCorners), JSON.stringify({ enabled: true, topLeft: false, topRight: true, bottomLeft: true, bottomRight: false }));
    Assert.equal(outputs["DP-2"].layout.backgroundColor, "#303030", { message: "the deprecated output background-color" });
    Assert.equal(outputs["DP-2"].hotCorners.enabled, false);
    Assert.equal(outputs["Acme Panel 1234"].layout.alwaysCenterSingleColumn, false);
    Assert.equal(outputs["Acme Panel 1234"].layout.fullscreenBackdropColor, "#112233");

    const skipped = result.skipped.join("\n");
    Assert.assert(skipped.includes('workspace "web"/layout/insert-hint'), { message: skipped });
    Assert.assert(skipped.includes('workspace "web"/layout/empty-workspace-above-first'));
    Assert.assert(skipped.includes("open-on-output is not mapped"));
    Assert.assert(skipped.includes("output: only its layout"), { message: "the rest of output stays reported" });

    // the global settings are not touched by the overrides
    Assert.equal(result.settings["gapsInnerHorizontal"], 12);
    Assert.equal(result.settings["focusRingWidth"], 4);

    let json: any = undefined;
    try {
        const out = require("child_process").execFileSync("python3", ["-I", "tools/niri2kiri.py", path, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: "1" }) });
        json = JSON.parse(out);
    } catch (error: any) {
        console.log("python3 is not usable here, skipped the tools/niri2kiri.py comparison:", String(error).substring(0, 100));
    }
    if (json !== undefined) {
        const sorted = (object: Record<string, any>) => JSON.stringify(Object.keys(object).sort().map(name => [name, object[name]]));
        Assert.equal(sorted(json.settings), sorted(result.settings), { message: "settings of tools/niri2kiri.py" });
        Assert.equalArrays(json.skipped.slice().sort(), result.skipped.slice().sort(), { message: "skipped lines of tools/niri2kiri.py" });
    }
});
