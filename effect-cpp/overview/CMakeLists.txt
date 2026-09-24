find_package(Qt6 REQUIRED COMPONENTS Quick Qml)

kcoreaddons_add_plugin(kiri_overview
    SOURCES OverviewEffect.h OverviewEffect.cpp main.cpp
    INSTALL_NAMESPACE "kwin/effects/plugins")

qt_add_resources(kiri_overview kiri_overview_qml
    PREFIX "/kiri/overview"
    FILES qml/Main.qml)

target_include_directories(kiri_overview PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../common)
target_link_libraries(kiri_overview PRIVATE
    KWin::kwin
    KF6::ConfigCore
    KF6::CoreAddons
    Qt6::Gui
    Qt6::DBus
    Qt6::Quick
    Qt6::Qml)
