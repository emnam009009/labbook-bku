@echo off
REM ===================================================================
REM Round 102 LabBook BKU Origin Lab integration installer
REM
REM Strategy: read static wrapper-template.bat, replace __PLACEHOLDER__
REM tokens via PowerShell, write to USERPROFILE. This avoids the
REM batch-escape hell of generating wrapper line-by-line with echo.
REM ===================================================================

setlocal EnableDelayedExpansion
echo ===================================================================
echo  LabBook BKU Cai dat tich hop Origin Lab Round 102
echo ===================================================================
echo.

REM Step 1: Locate Origin.exe
set "ORIGIN_EXE="
for %%P in (
  "C:\Program Files\OriginLab\Origin2025\Origin64.exe"
  "C:\Program Files\OriginLab\Origin2024\Origin64.exe"
  "C:\Program Files\OriginLab\Origin2023\Origin64.exe"
  "C:\Program Files\OriginLab\Origin2022\Origin64.exe"
  "C:\Program Files\OriginLab\Origin2021\Origin64.exe"
  "C:\Program Files\OriginLab\Origin2020\Origin64.exe"
  "C:\Program Files\OriginLab\Origin2019\Origin64.exe"
  "C:\Program Files\OriginLab\Origin2018\Origin64.exe"
  "C:\Program Files (x86)\OriginLab\Origin2025\Origin.exe"
  "C:\Program Files (x86)\OriginLab\Origin2024\Origin.exe"
  "C:\Program Files (x86)\OriginLab\Origin2023\Origin.exe"
) do (
  if exist %%P (
    set "ORIGIN_EXE=%%~P"
    goto :found_origin
  )
)

echo Khong tim thay Origin.exe trong cac thu muc thong thuong.
set /p ORIGIN_EXE="Origin.exe path: "

if not exist "!ORIGIN_EXE!" (
  echo [ERROR] File khong ton tai: !ORIGIN_EXE!
  pause
  exit /b 1
)

:found_origin
echo [OK] Tim thay Origin: "!ORIGIN_EXE!"
echo.

REM Step 2: Locate User Files Folder (UFF)
set "UFF="
for %%U in (
  "%USERPROFILE%\Documents\OriginLab\Origin2025\User Files"
  "%USERPROFILE%\Documents\OriginLab\Origin2024\User Files"
  "%USERPROFILE%\Documents\OriginLab\Origin2023\User Files"
  "%USERPROFILE%\Documents\OriginLab\Origin2022\User Files"
  "%USERPROFILE%\Documents\OriginLab\Origin2021\User Files"
  "%USERPROFILE%\Documents\OriginLab\Origin2020\User Files"
  "%USERPROFILE%\Documents\OriginLab\User Files"
  "%USERPROFILE%\Documents\OriginLab"
  "%USERPROFILE%\Documents\Origin User Files"
) do (
  if exist %%U (
    set "UFF=%%~U"
    goto :found_uff
  )
)

echo Khong tim thay User Files Folder cua Origin.
echo De tim UFF, mo Origin -^> Help -^> Open Folder -^> User Files Folder
set /p UFF="Nhap path UFF: "

if not exist "!UFF!" (
  echo [ERROR] UFF khong ton tai: !UFF!
  pause
  exit /b 1
)

:found_uff
echo [OK] Tim thay UFF: "!UFF!"
echo.

REM Step 3: Verify wrapper-template.bat exists in same folder
set "TEMPLATE=%~dp0wrapper-template.bat"
if not exist "!TEMPLATE!" (
  echo [ERROR] wrapper-template.bat khong tim thay tai:
  echo         !TEMPLATE!
  echo Hay dam bao folder cai dat co ca install.bat va wrapper-template.bat
  pause
  exit /b 1
)
echo [OK] Wrapper template: "!TEMPLATE!"
echo.

REM Step 4: Generate wrapper.bat using PowerShell
set "WRAPPER=%USERPROFILE%\labbook-origin.bat"
echo [Step 4] Tao wrapper script: !WRAPPER!

REM PowerShell reads template, replaces placeholders, writes wrapper.
REM We escape single backslashes in paths since PowerShell uses them
REM literally in -replace string mode (no regex needed with literal flag).
powershell -NoProfile -Command ^
  "$tpl = Get-Content -Raw -Encoding ASCII '%TEMPLATE%';" ^
  "$tpl = $tpl.Replace('__ORIGIN_EXE__', '%ORIGIN_EXE%');" ^
  "$tpl = $tpl.Replace('__UFF__', '%UFF%');" ^
  "[System.IO.File]::WriteAllText('%WRAPPER%', $tpl, [System.Text.Encoding]::ASCII)"

if errorlevel 1 (
  echo [ERROR] PowerShell that bai khi tao wrapper.
  pause
  exit /b 1
)

if not exist "!WRAPPER!" (
  echo [ERROR] Wrapper khong duoc tao tai !WRAPPER!
  pause
  exit /b 1
)
echo [OK] Wrapper script da tao
echo.

REM Step 5: Generate and import .reg file
set "REGFILE=%TEMP%\labbook-origin-handler.reg"
echo [Step 5] Tao registry file: !REGFILE!
> "!REGFILE!" echo Windows Registry Editor Version 5.00
>>"!REGFILE!" echo.
>>"!REGFILE!" echo [HKEY_CURRENT_USER\Software\Classes\labbook-origin]
>>"!REGFILE!" echo @="URL: LabBook Origin Launcher"
>>"!REGFILE!" echo "URL Protocol"=""
>>"!REGFILE!" echo.
>>"!REGFILE!" echo [HKEY_CURRENT_USER\Software\Classes\labbook-origin\DefaultIcon]
>>"!REGFILE!" echo @="!ORIGIN_EXE:\=\\!,1"
>>"!REGFILE!" echo.
>>"!REGFILE!" echo [HKEY_CURRENT_USER\Software\Classes\labbook-origin\shell]
>>"!REGFILE!" echo.
>>"!REGFILE!" echo [HKEY_CURRENT_USER\Software\Classes\labbook-origin\shell\open]
>>"!REGFILE!" echo.
>>"!REGFILE!" echo [HKEY_CURRENT_USER\Software\Classes\labbook-origin\shell\open\command]
>>"!REGFILE!" echo @="cmd.exe /c \"!WRAPPER:\=\\!\" \"%%1\""

echo [Step 6] Import vao registry...
reg import "!REGFILE!" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Khong import duoc registry. Hay chay file:
  echo         !REGFILE!
  pause
  exit /b 1
)
echo [OK] Da dang ky labbook-origin protocol
del "!REGFILE!" >nul 2>&1

echo.
echo ===================================================================
echo  THANH CONG Round 102
echo ===================================================================
echo.
echo Cau hinh:
echo   Origin: !ORIGIN_EXE!
echo   UFF:    !UFF!
echo   Wrapper: !WRAPPER!
echo.
echo Verify wrapper:
echo   type %%USERPROFILE%%\labbook-origin.bat
echo Phai thay !ARG!, !FNAME!, !OGSNAME! literally trong noi dung.
echo.
pause
