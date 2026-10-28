@echo off
chcp 65001 >nul
setlocal
where py >nul 2>nul
if errorlevel 1 (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3을 찾지 못했습니다. 내부망 관리자의 설치 절차를 확인하세요.
    pause
    exit /b 2
  )
  python "%~dp0..\preflight.py" --interactive --run
) else (
  py -3 "%~dp0..\preflight.py" --interactive --run
)
set "RPA_EXIT=%ERRORLEVEL%"
echo.
echo 종료 코드: %RPA_EXIT% - 사전검사 통과와 실제 등록 성공은 다릅니다.
pause
exit /b %RPA_EXIT%
