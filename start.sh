#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# VoidScript launcher for Linux. Same launcher as macOS (MacOS_Start.command
# handles both); this just gives Linux users the name they expect.
#
# Roblox Studio on Linux runs under Wine - install it with Vinegar
# (flatpak install flathub org.vinegarhq.Vinegar), open Studio once, then run:
#   ./start.sh
# The bridge finds Studio's StudioMCP.exe inside Vinegar / Wine on its own.
# Unusual setup? Point it at the file, or give the whole command:
#   VS_STUDIO_MCP_PATH=/path/to/StudioMCP.exe ./start.sh
#   VS_STUDIO_MCP_CMD="wine /path/to/StudioMCP.exe" ./start.sh
#   VS_WINE=/path/to/wine ./start.sh
exec bash "$(dirname "$0")/MacOS_Start.command" "$@"
