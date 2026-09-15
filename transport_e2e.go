//go:build e2e

package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// E2E serves the real Wails assets and binding dispatcher to Playwright.
// This transport is excluded from both development and production builds.
type browserTestTransport struct {
	*application.HTTPTransport
	server *http.Server
}

func applicationTransport() application.Transport {
	return &browserTestTransport{HTTPTransport: application.NewHTTPTransport()}
}

func (t *browserTestTransport) ServeAssets(handler http.Handler) error {
	port := os.Getenv("OBAILS_E2E_PORT")
	if port == "" {
		return fmt.Errorf("OBAILS_E2E_PORT must be supplied by the test runner")
	}
	listener, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", port))
	if err != nil {
		return err
	}
	t.server = &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != listener.Addr().String() || (r.Header.Get("Origin") != "" && r.Header.Get("Origin") != "http://"+r.Host) {
			http.Error(w, "E2E server accepts same-origin loopback requests only", http.StatusForbidden)
			return
		}
		handler.ServeHTTP(w, r)
	})}
	go func() {
		if err := t.server.Serve(listener); err != http.ErrServerClosed {
			log.Printf("E2E HTTP server: %v", err)
		}
	}()
	return nil
}

func (t *browserTestTransport) Stop() error {
	if t.server != nil {
		return t.server.Close()
	}
	return nil
}
