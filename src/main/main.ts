// `savedState` is what the previous run of the script saved (see Kiri.saveState); empty on a first start
function init(savedState = "") {
    const config = loadConfig();
    return new Kiri(config, new World(config, null, Kiri.parseState(savedState)));
}
