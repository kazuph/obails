package main

import (
	"net/http"
	"testing"
)

func TestRuntimeRequestAllowed(t *testing.T) {
	cases := []struct {
		name, method, origin, referrer string
		want                           bool
	}{
		{"production main", "POST", "", "wails://localhost/", true},
		{"sandbox", "POST", "null", "about:srcdoc", false},
		{"blank document", "POST", "", "about:blank", false},
		{"data document", "POST", "", "data:text/html,x", false},
		{"external referrer", "POST", "", "https://elsewhere.invalid/", false},
		{"no referrer", "POST", "", "", false},
		{"sandbox fake referrer", "POST", "null", "wails://localhost:9245/", false},
		{"external origin", "POST", "https://elsewhere.invalid", "wails://localhost:9245/", false},
		{"wrong host", "POST", "", "wails://localhost:9245.evil/", false},
		{"get", "GET", "", "wails://localhost:9245/", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequest(tc.method, "http://localhost/wails/runtime", nil)
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("Referer", tc.referrer)
			if got := runtimeRequestAllowed(req); got != tc.want {
				t.Fatalf("got %v want %v", got, tc.want)
			}
		})
	}
}
