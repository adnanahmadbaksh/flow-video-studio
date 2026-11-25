#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js nahi mila. Pehle https://nodejs.org se install karein."; read; exit 1; }
(sleep 1; open http://localhost:3000) &
node server.js
