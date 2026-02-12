//go:build cli

package main

import (
	"encoding/json"
	"fmt"
	"os"
)

// outputJSON writes data as indented JSON to stdout.
func outputJSON(data any) {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(data); err != nil {
		fmt.Fprintf(os.Stderr, "Error encoding JSON: %v\n", err)
		os.Exit(1)
	}
}

// outputText writes plain text to stdout.
func outputText(text string) {
	fmt.Println(text)
}

// outputError writes an error in the appropriate format to stderr
// and exits with code 1.
func outputError(err error) {
	if outputFormat == "json" {
		errObj := map[string]string{"error": err.Error()}
		data, _ := json.MarshalIndent(errObj, "", "  ")
		fmt.Fprintln(os.Stderr, string(data))
	} else {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
	}
	os.Exit(1)
}

// outputResult outputs data based on the current output format.
// For JSON format, it outputs the structured data.
// For text format, it outputs the provided text representation.
func outputResult(data any, textRepr string) {
	if outputFormat == "json" {
		outputJSON(data)
	} else {
		outputText(textRepr)
	}
}
