kcoreaddons_add_plugin(kiri_decorations
    SOURCES DecorationsEffect.h DecorationsEffect.cpp plugin.cpp
    INSTALL_NAMESPACE "kwin/effects/plugins")

target_link_libraries(kiri_decorations PRIVATE
    KWin::kwin
    KF6::ConfigCore
    KF6::CoreAddons
    Qt6::Gui
    Qt6::DBus
    epoxy::epoxy)

target_include_directories(kiri_decorations PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../common)
