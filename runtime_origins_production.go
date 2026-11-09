//go:build production

package main

func runtimeAllowedOrigins() []string {
	return []string{"wails://localhost"}
}
