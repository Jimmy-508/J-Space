@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

cd /d "%~dp0"
if errorlevel 1 (
  echo 無法切換到 J-Space 專案目錄。
  pause
  exit /b 1
)

echo.
echo ========================================
echo J-Space 圖片發布工具
echo ========================================
echo 專案路徑：%CD%

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo 錯誤：目前目錄不是 Git repository。
  pause
  exit /b 1
)

for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
echo Git branch：!CURRENT_BRANCH!
echo.
echo 目前 Git 狀態：
git status --short

if /i not "!CURRENT_BRANCH!"=="main" (
  echo.
  echo 錯誤：目前不在 main branch，本次已取消。
  pause
  exit /b 1
)

git status --porcelain --untracked-files=all | findstr /r "." >nul
if errorlevel 1 (
  echo.
  echo 沒有偵測到需要發布的變更。
  pause
  exit /b 0
)

call :CheckImagesOnly
if errorlevel 1 exit /b 1

call :RunBuild
if errorlevel 1 (
  echo.
  echo Build 失敗，尚未執行 git add、commit 或 push。
  pause
  exit /b 1
)

rem Build output is normally ignored, but check again before staging for safety.
call :CheckImagesOnly
if errorlevel 1 exit /b 1

git add .
if errorlevel 1 (
  echo.
  echo git add 失敗，本次發布已取消。
  pause
  exit /b 1
)

set "STAMP="
for /f "usebackq delims=" %%T in (`powershell.exe -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH-mm'"`) do set "STAMP=%%T"
if not defined STAMP (
  echo.
  echo 無法產生穩定的 commit 日期時間。
  pause
  exit /b 1
)

git commit -m "chore: update J-Space images !STAMP!"
if errorlevel 1 (
  echo.
  echo git commit 失敗，尚未執行 push。
  pause
  exit /b 1
)

git push origin main
if errorlevel 1 (
  echo.
  echo git push origin main 失敗。
  pause
  exit /b 1
)

echo.
echo 圖片更新已推送至 GitHub。
echo GitHub Pages 將透過既有 workflow 自動部署。
echo.
echo 正式網站：
echo https://jimmy-508.github.io/J-Space/
echo.
echo 圖片網址格式：
echo https://jimmy-508.github.io/J-Space/images/檔名
echo.
echo 最終 Git 狀態：
git status --short | findstr /r "." >nul
if errorlevel 1 (
  echo 發布完成，Git 狀態乾淨。
) else (
  git status --short
)

pause
exit /b 0

:CheckImagesOnly
git status --porcelain --untracked-files=all -- . ":(exclude)public/images/**" | findstr /r "." >nul
if not errorlevel 1 (
  echo.
  echo 偵測到 images 以外的專案變更。
  echo 為避免誤將程式修改一起發布，本次已取消。
  echo 請先處理其他變更後再重新執行。
  pause
  exit /b 1
)
exit /b 0

:RunBuild
echo.
echo 正在執行 production build...

set "BUNDLED_PNPM=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
if exist "!BUNDLED_PNPM!" (
  call "!BUNDLED_PNPM!" --version >nul 2>&1
  if not errorlevel 1 (
    echo 使用 bundled pnpm：
    call "!BUNDLED_PNPM!" --version
    call "!BUNDLED_PNPM!" run build
    exit /b !errorlevel!
  )
  echo bundled pnpm 無法正常執行，嘗試下一個候選...
)

where pnpm.cmd >nul 2>&1
if not errorlevel 1 (
  call pnpm.cmd --version >nul 2>&1
  if not errorlevel 1 (
    echo 使用 pnpm.cmd：
    call pnpm.cmd --version
    call pnpm.cmd run build
    exit /b !errorlevel!
  )
  echo pnpm.cmd 無法正常執行，嘗試下一個候選...
)

where corepack.cmd >nul 2>&1
if not errorlevel 1 (
  call corepack.cmd pnpm --version >nul 2>&1
  if not errorlevel 1 (
    echo 使用 corepack pnpm：
    call corepack.cmd pnpm --version
    call corepack.cmd pnpm run build
    exit /b !errorlevel!
  )
  echo corepack pnpm 無法正常執行。
)

echo 找不到可用的 pnpm，production build 無法執行。
exit /b 1
