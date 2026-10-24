@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo   ペナント監督：スマホで遊ぶためのサーバーを動かしています。
echo.
echo   スマホをこのパソコンと同じ Wi-Fi につないで、
echo   スマホのブラウザで次のアドレスを開いてください。
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do for /f "tokens=*" %%b in ("%%a") do echo       http://%%b:8000
echo.
echo   やめるときは、この黒い画面を閉じてください。
echo.
python -m http.server 8000 --bind 0.0.0.0
pause
