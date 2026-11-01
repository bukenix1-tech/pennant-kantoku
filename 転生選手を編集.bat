@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo   ペナント監督：転生選手の編集画面を開いています。
echo   ブラウザが開かなければ http://127.0.0.1:8770/ を開いてください。
echo.
echo   やめるときは、この黒い画面を閉じてください。
echo.
python tools\reborn_edit.py
pause
