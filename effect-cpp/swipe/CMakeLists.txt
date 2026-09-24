kcoreaddons_add_plugin(kiri_swipe
    SOURCES SwipeEffect.h SwipeEffect.cpp main.cpp
    INSTALL_NAMESPACE "kwin/effects/plugins")

target_link_libraries(kiri_swipe PRIVATE
    KWin::kwin
    KF6::ConfigCore
    KF6::CoreAddons
    Qt6::Gui
    Qt6::DBus)
