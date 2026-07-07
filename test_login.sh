#!/bin/bash
echo '{"username":"admin","password":"Pwk8q12v@"}' > /tmp/login.json
curl -s -X POST http://localhost:3005/api/auth/login \
  -H 'Content-Type: application/json' \
  -d @/tmp/login.json
echo ""
