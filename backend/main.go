// It is a web server for collect prius battery monitor data

package main

//go:generate go run github.com/ogen-go/ogen/cmd/ogen --target ./internal/api --package api --clean api/openapi.yaml

import (
	"context"
	"embed"
	"encoding/json"
	"flag"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"os"
	"time"

	api "github.com/dnovozhilov/prius-battery-mon/backend/internal/api"
)

func init() {
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
}

//go:embed all:static/dist
var static embed.FS

func main() {
	listenAddr := flag.String("listen", ":8080", "ip and port to listen as web server")
	jsonlPath := flag.String("jsonl", "prius-battery-mon.jsonl", "path to JSONL history file")
	flag.Parse()

	jsonlFile, err := os.OpenFile(*jsonlPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		log.Fatalf("open %s: %v", *jsonlPath, err)
	}
	defer jsonlFile.Close()
	log.Printf("appending snapshots to %s", *jsonlPath)
	go syncLoop(jsonlFile)

	router, err := newHTTPHandler(&snapshotHandler{file: jsonlFile})
	if err != nil {
		log.Fatalf("router: %v", err)
	}
	log.Printf("listening on %s", *listenAddr)
	if err := http.ListenAndServe(*listenAddr, router); err != nil {
		log.Fatalf("listen %s: %v", *listenAddr, err)
	}
}

func newHTTPHandler(h api.Handler) (http.Handler, error) {
	apiServer, err := api.NewServer(h)
	if err != nil {
		return nil, err
	}
	sub, err := fs.Sub(static, "static/dist")
	if err != nil {
		return nil, err
	}
	staticHandler := http.FileServer(http.FS(sub))

	mux := http.NewServeMux()
	mux.Handle("/api/", apiServer)
	mux.Handle("/", noCacheForHTML(staticHandler))
	return mux, nil
}

func syncLoop(f *os.File) {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for range t.C {
		if err := f.Sync(); err != nil {
			log.Printf("sync: %v", err)
		}
	}
}

func noCacheForHTML(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/", "/index.html", "/sw.js", "/manifest.webmanifest":
			w.Header().Set("Cache-Control", "no-cache")
		}
		next.ServeHTTP(w, r)
	})
}

type snapshotHandler struct{ file *os.File }

type storedSnapshot struct {
	ServerTs string        `json:"server_ts"`
	Ts       time.Time     `json:"ts"`
	Device   string        `json:"device"`
	Raw      []int         `json:"raw"`
	Ntc      api.NtcParams `json:"ntc"`
}

func (h *snapshotHandler) PostSnapshot(ctx context.Context, req *api.Snapshot) (api.PostSnapshotRes, error) {
	if len(req.Raw) != req.Ntc.SensorsCnt {
		return &api.Error{Message: "raw length must equal ntc.sensors_cnt"}, nil
	}
	stored := storedSnapshot{
		ServerTs: time.Now().UTC().Format(time.RFC3339Nano),
		Ts:       req.Ts,
		Device:   req.Device,
		Raw:      req.Raw,
		Ntc:      req.Ntc,
	}
	line, err := json.Marshal(stored)
	if err != nil {
		return nil, err
	}
	if _, err := h.file.Write(append(line, '\n')); err != nil {
		return nil, err
	}
	return &api.PostSnapshotNoContent{}, nil
}
