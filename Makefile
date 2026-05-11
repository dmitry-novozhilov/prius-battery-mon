.PHONY: all build build-web generate test run clean

DIST_DIR := web-service/static/dist

all: build

build-web:
	rm -rf $(DIST_DIR)
	mkdir -p $(DIST_DIR)
	touch $(DIST_DIR)/.gitkeep
	DOCKER_BUILDKIT=1 docker build \
		--target export \
		--output type=local,dest=$(DIST_DIR) \
		web-app

generate:
	cd web-service && go generate ./...

test:
	cd web-service && go test ./...

build: build-web
	cd web-service && go build -o ../bin/web-service .

run: build
	cd web-service && go run .

clean:
	rm -rf bin $(DIST_DIR)
	mkdir -p $(DIST_DIR)
	touch $(DIST_DIR)/.gitkeep
