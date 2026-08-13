//go:build !production

package main

import _ "embed"

//go:embed build/appicon.dev.png
var appIcon []byte

const applicationName = "Obails Dev"
