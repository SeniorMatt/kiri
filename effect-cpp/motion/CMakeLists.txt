kcoreaddons_add_plugin(kiri_motion
    SOURCES MotionEffect.h MotionEffect.cpp plugin.cpp
    INSTALL_NAMESPACE "kwin/effects/plugins")

target_include_directories(kiri_motion PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../common)
target_link_libraries(kiri_motion PRIVATE
    KWin::kwin
    KF6::ConfigCore
    KF6::CoreAddons
    Qt6::Gui
    epoxy::epoxy)
