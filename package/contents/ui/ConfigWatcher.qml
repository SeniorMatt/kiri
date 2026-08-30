import QtQuick
import Qt.labs.folderlistmodel
import Qt.labs.platform

// Emits `changed` when kwinrc is written (by the settings dialog, kwriteconfig6, ...)
Item {
    id: watcher

    signal changed()

    FolderListModel {
        id: model
        folder: StandardPaths.writableLocation(StandardPaths.GenericConfigLocation)
        nameFilters: ["kwinrc"]
        showDirs: false
        showDotAndDotDot: false
        onDataChanged: debounce.restart()
        onRowsInserted: debounce.restart()
        onRowsRemoved: debounce.restart()
        onCountChanged: debounce.restart()
    }

    // kwinrc is saved in several steps and KWin writes to it too, wait until it settles
    Timer {
        id: debounce
        interval: 400
        onTriggered: watcher.changed()
    }
}
