import QtQuick
import QtQuick.Window
Window { visible: true; width: 600; height: 500; color: "#334455"; title: Qt.application.arguments[Qt.application.arguments.length-1]
 Rectangle { anchors.fill: parent; gradient: Gradient { orientation: Gradient.Horizontal; GradientStop { position: 0; color: "#ff4040" } GradientStop { position: 1; color: "#4060ff" } } }
 Rectangle { x: 20; y: 20; width: parent.width - 40; height: 60; color: "white"; Text { anchors.centerIn: parent; text: title; font.pixelSize: 30 } }
 Rectangle { anchors.centerIn: parent; width: 160; height: 160; radius: 80; color: Qt.application.arguments[Qt.application.arguments.length-2] }
}
