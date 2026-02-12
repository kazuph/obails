//go:build cli

package main

import (
	"os"
)

func main() {
	if err := rootCmd.Execute(); err != nil {
		outputError(err)
		os.Exit(1)
	}
}
