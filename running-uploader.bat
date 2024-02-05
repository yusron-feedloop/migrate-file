@echo off

REM Open the first Command Prompt window
start /B cmd /k "cd %USERPROFILE%\Documents\Qore - Uploader\ && npm start"

REM Open the second Command Prompt window
start /B cmd /k "cd %USERPROFILE%\Documents\Redis-x64-5.0.14.1\ && redis-server.exe"