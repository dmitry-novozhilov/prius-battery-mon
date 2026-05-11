package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	api "github.com/dnovozhilov/prius-battery-mon/web-service/internal/api"
)

func newTestHandler(t *testing.T) (*snapshotHandler, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "snap.jsonl")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatalf("open temp file: %v", err)
	}
	t.Cleanup(func() { _ = f.Close() })
	return &snapshotHandler{file: f}, path
}

func validSnapshot() *api.Snapshot {
	raw := make([]int, 32)
	for i := range raw {
		raw[i] = 2000 + i
	}
	return &api.Snapshot{
		Ts:     time.Date(2026, 5, 11, 12, 0, 0, 0, time.UTC),
		Device: "PriusBattMon",
		Raw:    raw,
		Ntc: api.NtcParams{
			R0: 10000, T0: 25, B: 3435,
			Pullup: 10000, AdcBits: 12, SensorsCnt: 32,
		},
	}
}

func readJSONL(t *testing.T, path string) []storedSnapshot {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if len(data) == 0 {
		return nil
	}
	lines := bytes.Split(bytes.TrimRight(data, "\n"), []byte("\n"))
	out := make([]storedSnapshot, len(lines))
	for i, line := range lines {
		if err := json.Unmarshal(line, &out[i]); err != nil {
			t.Fatalf("line %d unmarshal: %v (line=%s)", i, err, line)
		}
	}
	return out
}

func TestPostSnapshot_StoresLine(t *testing.T) {
	h, path := newTestHandler(t)
	before := time.Now().UTC().Add(-time.Second)

	res, err := h.PostSnapshot(context.Background(), validSnapshot())
	if err != nil {
		t.Fatalf("PostSnapshot: %v", err)
	}
	if _, ok := res.(*api.PostSnapshotNoContent); !ok {
		t.Fatalf("expected *PostSnapshotNoContent, got %T", res)
	}

	got := readJSONL(t, path)
	if len(got) != 1 {
		t.Fatalf("expected 1 line, got %d", len(got))
	}
	s := got[0]
	if !s.Ts.Equal(time.Date(2026, 5, 11, 12, 0, 0, 0, time.UTC)) {
		t.Errorf("ts roundtrip: %v", s.Ts)
	}
	if s.Device != "PriusBattMon" {
		t.Errorf("device: %q", s.Device)
	}
	if len(s.Raw) != 32 || s.Raw[0] != 2000 || s.Raw[31] != 2031 {
		t.Errorf("raw mismatch: len=%d first=%d last=%d", len(s.Raw), s.Raw[0], s.Raw[31])
	}
	if s.Ntc.B != 3435 || s.Ntc.SensorsCnt != 32 {
		t.Errorf("ntc mismatch: %+v", s.Ntc)
	}
	ts, err := time.Parse(time.RFC3339Nano, s.ServerTs)
	if err != nil {
		t.Fatalf("server_ts parse: %v (raw=%q)", err, s.ServerTs)
	}
	if ts.Before(before) {
		t.Errorf("server_ts %v older than start %v", ts, before)
	}
}

func TestPostSnapshot_MismatchedSensorsCnt(t *testing.T) {
	h, path := newTestHandler(t)
	snap := validSnapshot()
	snap.Ntc.SensorsCnt = 16 // не совпадает с len(raw)=32

	res, err := h.PostSnapshot(context.Background(), snap)
	if err != nil {
		t.Fatalf("PostSnapshot: %v", err)
	}
	errRes, ok := res.(*api.Error)
	if !ok {
		t.Fatalf("expected *api.Error, got %T", res)
	}
	if !strings.Contains(errRes.Message, "raw length") {
		t.Errorf("unexpected error message: %q", errRes.Message)
	}
	if data, _ := os.ReadFile(path); len(data) != 0 {
		t.Errorf("file should remain empty on validation error, got: %s", data)
	}
}

func TestPostSnapshot_AppendsMultipleLines(t *testing.T) {
	h, path := newTestHandler(t)
	for i := 0; i < 3; i++ {
		if _, err := h.PostSnapshot(context.Background(), validSnapshot()); err != nil {
			t.Fatalf("iter %d: %v", i, err)
		}
	}
	got := readJSONL(t, path)
	if len(got) != 3 {
		t.Fatalf("expected 3 lines, got %d", len(got))
	}
}

func newTestServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	h, path := newTestHandler(t)
	router, err := newHTTPHandler(h)
	if err != nil {
		t.Fatalf("newHTTPHandler: %v", err)
	}
	srv := httptest.NewServer(router)
	t.Cleanup(srv.Close)
	return srv, path
}

func postJSON(t *testing.T, url, body string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, url, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	return res
}

func buildSnapshotJSON(rawLen, sensorsCnt int) string {
	var sb strings.Builder
	sb.WriteString(`{"ts":"2026-05-11T12:00:00Z","device":"PriusBattMon","raw":[`)
	for i := 0; i < rawLen; i++ {
		if i > 0 {
			sb.WriteByte(',')
		}
		sb.WriteString("2000")
	}
	sb.WriteString(`],"ntc":{"r0":10000,"t0":25,"b":3435,"pullup":10000,"adc_bits":12,"sensors_cnt":`)
	sb.WriteString(strconv.Itoa(sensorsCnt))
	sb.WriteString(`}}`)
	return sb.String()
}

func TestHTTP_PostSnapshot_OK(t *testing.T) {
	srv, path := newTestServer(t)
	res := postJSON(t, srv.URL+"/api/snapshot", buildSnapshotJSON(32, 32))
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("status=%d body=%s", res.StatusCode, body)
	}
	if got := readJSONL(t, path); len(got) != 1 {
		t.Errorf("expected 1 line in jsonl, got %d", len(got))
	}
}

func TestHTTP_PostSnapshot_TooShortRaw_OgenRejects(t *testing.T) {
	srv, path := newTestServer(t)
	res := postJSON(t, srv.URL+"/api/snapshot", buildSnapshotJSON(3, 32))
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected 400, got %d (body=%s)", res.StatusCode, body)
	}
	if data, _ := os.ReadFile(path); len(data) != 0 {
		t.Errorf("file must be empty when validation fails, got: %s", data)
	}
}

func TestHTTP_PostSnapshot_MismatchSensorsCnt_HandlerRejects(t *testing.T) {
	srv, path := newTestServer(t)
	res := postJSON(t, srv.URL+"/api/snapshot", buildSnapshotJSON(32, 16))
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("expected 400, got %d (body=%s)", res.StatusCode, body)
	}
	if data, _ := os.ReadFile(path); len(data) != 0 {
		t.Errorf("file must be empty on handler-level rejection, got: %s", data)
	}
}

func TestHTTP_PostSnapshot_MalformedJSON(t *testing.T) {
	srv, _ := newTestServer(t)
	res := postJSON(t, srv.URL+"/api/snapshot", `{"not":"valid`)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", res.StatusCode)
	}
}

func TestNoCacheForHTML(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := noCacheForHTML(next)

	for _, path := range []string{"/", "/index.html", "/sw.js", "/manifest.webmanifest"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if got := rr.Header().Get("Cache-Control"); got != "no-cache" {
			t.Errorf("%s: want no-cache, got %q", path, got)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/assets/index-abc.js", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if got := rr.Header().Get("Cache-Control"); got != "" {
		t.Errorf("/assets/...: want empty Cache-Control, got %q", got)
	}
}
