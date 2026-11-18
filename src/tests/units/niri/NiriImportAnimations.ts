// niri's animations block (niri-config/src/animations.rs): off, slowdown, and for each animation `off`, a spring, or an
// easing; tools/niri2kiri.py reads it the same way
tests.register("NiriImport: the animations block", 1, () => {
    const fs = require("fs");
    const path = "src/tests/fixtures/niri-animations.kdl";
    const result = NiriImport.parse(fs.readFileSync(path, "utf8"));
    const s = result.settings;
    Assert.equal(s["animationsSlowdown"], 2.5);
    Assert.equal(s["animationsOff"], true, { message: "off in any block turns every animation off" });
    Assert.equal(s["animWorkspaceSwitch"], "spring 0.8 900 0.00005");
    Assert.equal(s["animWindowOpen"], "ease-out-expo 300", { message: "a duration alone keeps the default curve" });
    Assert.equal(s["animWindowClose"], "ease-out-cubic 150", { message: "the last window-close node replaces the earlier one, the duration is the default's" });
    Assert.equal(s["animHorizontalViewMovement"], "ease-out-cubic 250", { message: "an easing for a spring animation: ease-out-cubic" });
    Assert.equal(s["animWindowMovement"], "off");
    Assert.equal(s["animWindowResize"], "linear 180");
    Assert.equal(s["animOverviewOpenClose"], "spring 1 700 0.0001");
    for (const reason of ["animations/config-notification-open-close", "animations/exit-confirmation-open-close", "animations/screenshot-ui-open", "animations/recent-windows-close"]) {
        Assert.assert(result.skipped.some(line => line.startsWith(reason + ": ")), { message: reason + " is skipped with a reason" });
    }
    Assert.assert(result.skipped.some(line => line.startsWith("animations/window-resize/custom-shader: ")), { message: "custom-shader is skipped with a reason" });
    Assert.assert(!result.skipped.some(line => line.includes("not supported by Kiri")), { message: "nothing is skipped without a reason" });

    // the same bezier text
    const bezier = NiriImport.parse("animations { window-close { duration-ms 90\n curve \"cubic-bezier\" 0.05 0.7 0.1 1 } window-open { curve \"nonsense\" } }");
    Assert.equal(bezier.settings["animWindowClose"], "cubic-bezier 90 0.05 0.7 0.1 1");
    Assert.equal(bezier.settings["animWindowOpen"], "ease-out-expo 150", { message: "an unknown curve leaves the default" });
    Assert.assert(bezier.skipped.some(line => line.startsWith("animations/window-open: unknown curve nonsense")), { message: "the unknown curve is reported" });
    const on = NiriImport.parse("animations { off }\nanimations { on }");
    Assert.equal(on.settings["animationsOff"], false, { message: "`on` in a later block turns them on again" });

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

// the defaults of the settings are niri's own
tests.register("Animation settings: the defaults are niri's", 1, () => {
    const defaults = (name: string) => getConfigDef().find(entry => entry.name === name)!.default;
    Assert.equal(defaults("animWindowOpen"), "ease-out-expo 150");
    Assert.equal(defaults("animWindowClose"), "ease-out-quad 150");
    Assert.equal(defaults("animWindowMovement"), "spring 1 800 0.0001");
    Assert.equal(defaults("animWindowResize"), "spring 1 800 0.0001");
    Assert.equal(defaults("animHorizontalViewMovement"), "spring 1 800 0.0001");
    Assert.equal(defaults("animWorkspaceSwitch"), "spring 1 1000 0.0001");
    Assert.equal(defaults("animOverviewOpenClose"), "spring 1 800 0.0001");
    Assert.equal(defaults("animationsOff"), false);
    Assert.equal(defaults("animationsSlowdown"), 1);
});
