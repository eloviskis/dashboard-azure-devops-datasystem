#!/bin/bash
PGPASSWORD=D3v0ps_D4sh_2026_Str0ng psql -h localhost -U devops_dash -d devops_dashboard -At -c "SELECT value FROM app_settings WHERE key='global_tabs_config'" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); [print(x['id'], x['visible']) for x in d]"
