@echo off
setlocal EnableDelayedExpansion
title 10k.world Domain Setup Tool

echo ===================================================
echo     10k.world Solana Wallet Recovery Tool Setup
echo ===================================================
echo.

:: Check for Administrative privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Administrator privileges are required to configure 10k.world in Windows hosts.
    echo [INFO] Requesting elevated permission...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

set HOSTS_FILE=%SystemRoot%\System32\drivers\etc\hosts

echo Checking %HOSTS_FILE%...
findstr /C:"10k.world" "%HOSTS_FILE%" >nul 2>&1
if %errorLevel% equ 0 (
    echo [SUCCESS] 10k.world is already configured in your hosts file!
) else (
    echo [INFO] Adding 10k.world mapping to hosts file...
    echo. >> "%HOSTS_FILE%"
    echo 127.0.0.1 10k.world >> "%HOSTS_FILE%"
    echo 127.0.0.1 www.10k.world >> "%HOSTS_FILE%"
    echo [SUCCESS] 10k.world and www.10k.world added successfully!
)

echo Flushing DNS cache...
ipconfig /flushdns >nul
echo [SUCCESS] DNS flushed.
echo.
echo ===================================================
echo Configuration Complete!
echo You can now access: https://10k.world/
echo.
echo NOTE: On your first visit, Chrome may show "Your connection is not private".
echo Simply click "Advanced" -> "Proceed to 10k.world (unsafe)".
echo ===================================================
echo.
echo Press any key to open https://10k.world/ in your default browser...
pause >nul

start https://10k.world/
exit /b
