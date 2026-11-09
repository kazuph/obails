package main

import (
	"net/http"
	"strings"
)

// runtimeRequestAllowed permits only the observed Wails main-frame request.
func runtimeRequestAllowed(r *http.Request) bool {
	if r.Method != http.MethodPost {
		return false
	}
	origin, referrer := r.Header.Get("Origin"), r.Header.Get("Referer")
	for _, trusted := range runtimeAllowedOrigins() {
		if (origin == "" || origin == trusted) && strings.HasPrefix(referrer, trusted+"/") {
			return true
		}
	}
	return false
}
