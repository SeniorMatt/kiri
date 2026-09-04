console.log(`<?xml version="1.0" encoding="UTF-8"?>
<kcfg xmlns="http://www.kde.org/standards/kcfg/1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.kde.org/standards/kcfg/1.0 http://www.kde.org/standards/kcfg/1.0/kcfg.xsd">
    <kcfgfile name="kwinrc" />
    <group name="">`);

for (const entry of [...configDef, ...getShortcutConfigDef()]) {
    const entryChoices: string[] | undefined = (entry as any).choices;
    const choices = entryChoices !== undefined
        ? `\n            <choices>\n${entryChoices.map(choice => `                <choice name="${choice}"/>`).join("\n")}\n            </choices>`
        : "";
    console.log(`        <entry name="${entry.name}" type="${entry.type}">${choices}
            <default>${escapeXml(entry.default)}</default>
        </entry>`);
}

console.log(`    </group>
</kcfg>`);

function escapeXml(input: any) {
    if (typeof input === "string") {
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    } else {
        return input;
    }
}
