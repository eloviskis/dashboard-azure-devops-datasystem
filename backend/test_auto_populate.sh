#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("token",""))')

echo "Token obtido: ${TOKEN:0:30}..."

echo "Chamando auto-populate..."
curl -s -X POST http://localhost:3001/api/qa-tracker/auto-populate \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN"
echo ""
