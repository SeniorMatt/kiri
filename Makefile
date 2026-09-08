VERSION = $(shell grep '"Version":' ./package/metadata.json | grep -o '[0-9\.]*')

.PHONY: *

build: lint test
	pnpm exec tsc -p ./src/main --outFile ./package/contents/code/main.js
	mkdir -p ./package/contents/config
	./run-ts.sh ./src/generators/config > ./package/contents/config/main.xml

npm-install:
	pnpm install --ignore-scripts

lint: npm-install
	pnpm exec eslint ./src

lint-fix: npm-install
	pnpm exec eslint ./src --fix

test:
	./run-ts.sh ./src/tests "${PATTERN}"

install: build
	kpackagetool6 --type=KWin/Script --install=./package || kpackagetool6 --type=KWin/Script --upgrade=./package
	kpackagetool6 --type=KWin/Effect --install=./effect || kpackagetool6 --type=KWin/Effect --upgrade=./effect

uninstall:
	kpackagetool6 --type=KWin/Script --remove=kiri
	kpackagetool6 --type=KWin/Effect --remove=kiri_animations

package: build
	rm -rf ./kiri-pkg-tmp
	mkdir -p ./kiri-pkg-tmp/kiri_${subst .,_,${VERSION}}
	cp -r ./package ./effect ./effect-cpp ./kiri-pkg-tmp/kiri_${subst .,_,${VERSION}}/
	cp ./tools/install.sh ./LICENSE ./README.md ./kiri-pkg-tmp/kiri_${subst .,_,${VERSION}}/
	rm -rf ./kiri-pkg-tmp/kiri_${subst .,_,${VERSION}}/effect-cpp/build
	tar -czf ./kiri_${subst .,_,${VERSION}}.tar.gz -C ./kiri-pkg-tmp kiri_${subst .,_,${VERSION}}
	rm -rf ./kiri-pkg-tmp
	rm -f ./kiri_${subst .,_,${VERSION}}.kwinscript
	cd ./package && zip -qr ../kiri_${subst .,_,${VERSION}}.kwinscript .

# builds and installs everything on this machine, including the compiled effects
install-all:
	./tools/install.sh

docs-key-bindings-bbcode:
	@./run-ts.sh ./src/generators/docs/keyBindingsBbcode

docs-key-bindings-markdown:
	@./run-ts.sh ./src/generators/docs/keyBindingsMarkdown

docs-key-bindings-fmt:
	@./run-ts.sh ./src/generators/docs/keyBindingsFmt
