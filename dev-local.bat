@echo off
setlocal
cd /d "%~dp0"

rem Local game only. Audience stays localhost, so the client and server
rem talk to http://localhost:8787 (the stub started by dev:all) and never
rem to api.openfront.io or api.openfront.dev.
set DOMAIN=localhost
set API_DOMAIN=
set FARO_COLLECTOR_URL=
set GAME_ENV=dev

call npm run start:client
