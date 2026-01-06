// It is a web server for collect prius battery monitor data

package main

import (
	"embed"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"time"
)

//go:embed static
var static embed.FS
var listenAddr string
var tsvFile *os.File

const tsvFilePath = "prius-battery-mon.tsv"

func init() {
	flag.StringVar(&listenAddr, "listen", ":8080", "ip and port to listen as web server")

	{
		var err error
		tsvFile, err = os.OpenFile(tsvFilePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
		if err != nil {
			log.Fatalf("failed to open %s: %v", tsvFilePath, err)
		} else {
			log.Printf("appending data to %s\n", tsvFilePath)
		}
		go func() {
			tmr := time.NewTimer(time.Second)
			defer tmr.Stop()
			for range tmr.C {
				if err := tsvFile.Sync(); err != nil {
					log.Fatalf("failed to sync file: %v", err)
				}
			}
		}()
	}
}

func main() {
	flag.Parse()

	fs, err := fs.Sub(static, "static")
	if err != nil {
		log.Fatal(err)
	}
	staticHandler := http.FileServer(http.FS(fs))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {

		log.Printf("http req %s %s\n", r.Method, r.URL)

		if r.Method == http.MethodGet {
			staticHandler.ServeHTTP(w, r)
			return
		}

		if r.Method == http.MethodPost {
			handleData(w, r)
			return
		}

		http.NotFoundHandler().ServeHTTP(w, r)
	})

	log.Printf("listening on %s\n", listenAddr)
	if err := http.ListenAndServe(listenAddr, nil); err != nil {
		log.Fatalf("failed to listen %s: %v", listenAddr, err)
	}
}

func handleData(w http.ResponseWriter, r *http.Request) {
	var err error
	defer func() {
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			log.Printf("failed to handle data: %v", err)
		} else {
			w.WriteHeader(http.StatusNoContent)
		}
	}()

	data, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("failed to read request body: %v", err)
	}

	data = append([]byte(time.Now().Format("2006-01-02 15:04:05")+"\t"), data...)

	if _, err = tsvFile.Write(append(data, '\n')); err != nil {
		err = fmt.Errorf("write %d bytes to file failed: %+w", len(data)+1, err)
	}
}
