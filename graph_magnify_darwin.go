//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c -fblocks
#cgo LDFLAGS: -framework AppKit

void setupObailsGraphMagnifyMonitor(void);
*/
import "C"

import "github.com/wailsapp/wails/v3/pkg/application"

var graphMagnifyWindow application.Window

func setupGraphMagnifyMonitor(window application.Window) {
	graphMagnifyWindow = window
	C.setupObailsGraphMagnifyMonitor()
}

//export goObailsGraphMagnify
func goObailsGraphMagnify(magnification C.double) {
	if graphMagnifyWindow == nil {
		return
	}
	graphMagnifyWindow.EmitEvent("obails:graph-magnify", float64(magnification))
}
