{ pkgs ? import <nixpkgs> { } }:

let
  kde = pkgs.kdePackages;
in
pkgs.mkShell {
  packages = with pkgs; [
    nodejs
    pnpm
    cmake
    pkg-config
    gnumake
    gcc
    extra-cmake-modules
    libepoxy
    libdrm
    vulkan-headers
    wayland
    qt6.qtbase
    qt6.qttools
    qt6.qtdeclarative
    kde.kwin
    kde.kdecoration
    kde.kconfig
    kde.kconfigwidgets
    kde.kcmutils
    kde.kcoreaddons
    kde.kwindowsystem
    kde.kpackage
  ];

  shellHook = ''
    export QT_PLUGIN_PATH="${kde.kwin}/lib/qt-6/plugins''${QT_PLUGIN_PATH:+:$QT_PLUGIN_PATH}"
  '';
}
