//go:build production

package main

import (
	"net/http"
	"reflect"
	"testing"
)

func TestProductionRuntimeOrigins(t *testing.T) {
	if got := runtimeAllowedOrigins(); !reflect.DeepEqual(got, []string{"wails://localhost"}) {
		t.Fatalf("production origins: %v", got)
	}
	for _, referrer := range []string{"http://127.0.0.1:9245/", "wails://localhost:9245/"} {
		r, _ := http.NewRequest(http.MethodPost, "http://localhost/wails/runtime", nil)
		r.Header.Set("Referer", referrer)
		if runtimeRequestAllowed(r) {
			t.Errorf("production accepted %q", referrer)
		}
	}
}
