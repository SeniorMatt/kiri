# Kiri decorations: a KWin effect that rounds window corners and paints Kiri's focus ring and borders
# as part of painting the window, so they follow window animations exactly.
cmake_minimum_required(VERSION 3.20)
project(kiri_effects VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()
if(CMAKE_INSTALL_PREFIX_INITIALIZED_TO_DEFAULT)
    set(CMAKE_INSTALL_PREFIX "/usr" CACHE PATH "Install prefix" FORCE)
endif()

find_package(ECM REQUIRED NO_MODULE)
set(CMAKE_MODULE_PATH ${CMAKE_MODULE_PATH} ${ECM_MODULE_PATH} ${ECM_KDE_MODULE_DIR})
include(FeatureSummary)
include(KDEInstallDirs)
include(KDECMakeSettings)
include(KDECompilerSettings NO_POLICY_SCOPE)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets DBus)
find_package(KF6 REQUIRED COMPONENTS Config CoreAddons)
find_package(KWin REQUIRED COMPONENTS kwineffects)
find_package(epoxy REQUIRED)

if(KWin_VERSION VERSION_LESS 6.7.90)
    message(FATAL_ERROR "Kiri decorations needs KWin 6.7.90 or newer, found ${KWin_VERSION}")
endif()

add_subdirectory(src)
add_subdirectory(switch)
add_subdirectory(shaders)

feature_summary(WHAT ALL FATAL_ON_MISSING_REQUIRED_PACKAGES)
