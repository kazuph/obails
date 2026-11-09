//go:build !production && !e2e

package main

func runtimeAllowedOrigins() []string {
	return []string{"wails://localhost", "wails://localhost:9245"}
}
