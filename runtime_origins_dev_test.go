//go:build !production && !e2e

package main

import (
	"net/http"
	"reflect"
	"testing"
)

func TestDevelopmentRuntimeOrigins(t *testing.T) {
	if got := runtimeAllowedOrigins(); !reflect.DeepEqual(got, []string{"wails://localhost", "wails://localhost:9245"}) {
		t.Fatalf("development origins: %v", got)
	}
	r, _ := http.NewRequest(http.MethodPost, "http://localhost/wails/runtime", nil)
	r.Header.Set("Origin", "wails://localhost:9245")
	r.Header.Set("Referer", "wails://localhost:9245/index.html")
	if !runtimeRequestAllowed(r) {
		t.Fatal("development main frame was rejected")
	}
}
