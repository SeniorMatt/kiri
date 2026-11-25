# Kiri's settings page for System Settings (Window Management > KWin Scripts > Kiri > Configure).
# It shows the same config.ui and main.xml as KWin's generic script page, plus reset buttons.
find_package(Qt6 QUIET COMPONENTS UiTools)
find_package(KF6 QUIET COMPONENTS KCMUtils ConfigWidgets)

if(NOT Qt6UiTools_FOUND OR NOT KF6KCMUtils_FOUND OR NOT KF6ConfigWidgets_FOUND)
    message(WARNING "Qt6 UiTools, KF6 KCMUtils or ConfigWidgets not found: skipping Kiri's settings page (KWin's generic one is used)")
    return()
endif()

set(CMAKE_AUTOMOC ON)
add_library(kcm_kiri MODULE KiriConfig.cpp)
target_link_libraries(kcm_kiri PRIVATE
    KF6::KCMUtils
    KF6::ConfigCore
    KF6::ConfigGui
    KF6::ConfigWidgets
    KF6::CoreAddons
    Qt6::Widgets
    Qt6::UiTools)
set_target_properties(kcm_kiri PROPERTIES PREFIX "")
install(TARGETS kcm_kiri DESTINATION ${KDE_INSTALL_QTPLUGINDIR}/kwin/effects/configs)
