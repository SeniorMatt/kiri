kcoreaddons_add_plugin(kiri_desktop_switch
    SOURCES DesktopSwitchEffect.h DesktopSwitchEffect.cpp main.cpp
    INSTALL_NAMESPACE "kwin/effects/plugins")

target_link_libraries(kiri_desktop_switch PRIVATE
    KWin::kwin
    KF6::ConfigCore
    KF6::CoreAddons
    Qt6::Gui
    Qt6::DBus)
