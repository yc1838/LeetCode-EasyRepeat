#!/bin/bash

# Simple script to manually test extension loading
# This will open Chrome with the extension and keep it open

EXTENSION_PATH="$(pwd)/dist"

echo "Extension path: $EXTENSION_PATH"
echo "Opening Chrome with extension..."
echo "Check chrome://extensions to see if the extension loaded"
echo "Press Ctrl+C to close"

/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --disable-extensions-except="$EXTENSION_PATH" \
  --load-extension="$EXTENSION_PATH" \
  --user-data-dir="$(pwd)/.manual-test-profile" \
  --no-first-run \
  --no-default-browser-check \
  "chrome://extensions" &

CHROME_PID=$!
echo "Chrome PID: $CHROME_PID"
echo "Waiting... (Press Ctrl+C to exit)"

wait $CHROME_PID
