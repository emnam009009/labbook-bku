@echo off
REM Round 95: Go cai dat LabBook Origin handler
echo Dang go cai dat...

REM Xoa registry key
reg delete "HKEY_CURRENT_USER\Software\Classes\labbook-origin" /f >nul 2>&1
if errorlevel 0 echo [OK] Da xoa registry protocol

REM Xoa wrapper batch
if exist "%USERPROFILE%\labbook-origin.bat" (
  del "%USERPROFILE%\labbook-origin.bat" >nul 2>&1
  echo [OK] Da xoa wrapper script
)

echo.
echo Da go cai dat hoan toan.
pause
