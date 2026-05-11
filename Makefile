.PHONY: all build build-frontend build-backend generate test run deploy clean

DIST_DIR := backend/static/dist
BIN      := bin/prius-battery-mon

# DEPLOY_HOST, DEPLOY_PATH, LISTEN are private (host alias, on-server path,
# bind address). Provide them via deploy.local.mk (gitignored) — see
# deploy.local.mk.example.
-include deploy.local.mk
DEPLOY_HOST  ?=
DEPLOY_PATH  ?=
LISTEN       ?=
SYSTEMD_UNIT ?= prius-battery-mon

# WorkingDirectory = directory containing the binary on the server.
WORKDIR := $(patsubst %/,%,$(dir $(DEPLOY_PATH)))

UNIT_TEMPLATE := backend/$(SYSTEMD_UNIT).service.template
UNIT_REMOTE   := .config/systemd/user/$(SYSTEMD_UNIT).service

all: build

build-frontend:
	rm -rf $(DIST_DIR)
	mkdir -p $(DIST_DIR)
	touch $(DIST_DIR)/.gitkeep
	DOCKER_BUILDKIT=1 docker build \
		--target export \
		--output type=local,dest=$(DIST_DIR) \
		frontend

build-backend: build-frontend
	cd backend && go build -o ../$(BIN) .

build: build-backend

generate:
	cd backend && go generate ./...

test:
	cd backend && go test ./...

run: build-backend
	./$(BIN)

deploy: build-backend
	@if [ -z "$(DEPLOY_HOST)" ] || [ -z "$(DEPLOY_PATH)" ] || [ -z "$(LISTEN)" ]; then \
		echo "deploy: DEPLOY_HOST, DEPLOY_PATH, LISTEN must be set (see deploy.local.mk.example)"; \
		exit 1; \
	fi
	ssh $(DEPLOY_HOST) 'systemctl --user stop $(SYSTEMD_UNIT)'
	ssh $(DEPLOY_HOST) "cat >$(DEPLOY_PATH) && chmod +x $(DEPLOY_PATH)" <$(BIN)
	sed -e 's|@WORKDIR@|$(WORKDIR)|g' \
	    -e 's|@BIN_PATH@|$(DEPLOY_PATH)|g' \
	    -e 's|@LISTEN@|$(LISTEN)|g' \
	    $(UNIT_TEMPLATE) \
	    | ssh $(DEPLOY_HOST) "cat >$(UNIT_REMOTE)"
	ssh $(DEPLOY_HOST) 'systemctl --user daemon-reload'
	ssh $(DEPLOY_HOST) 'systemctl --user start $(SYSTEMD_UNIT)'
	ssh $(DEPLOY_HOST) 'systemctl --user status $(SYSTEMD_UNIT)'

clean:
	rm -rf bin $(DIST_DIR)
	mkdir -p $(DIST_DIR)
	touch $(DIST_DIR)/.gitkeep
