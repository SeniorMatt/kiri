{
  description = "kiri - scrolling tiling for kde plasma 6";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          kde = pkgs.kdePackages;
        in
        {
          default = pkgs.mkShell {
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
          };
        });

      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt-rfc-style);
    };
}
