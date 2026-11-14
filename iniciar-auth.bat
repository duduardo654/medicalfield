@echo off
setlocal
chcp 65001 >nul
set PYTHONUTF8=1
cd /d "%~dp0"
set "SVC=services\auth-service"
set "PY=%SVC%\.venv\Scripts\python.exe"

where python >nul 2>nul || (echo [ERRO] Python nao encontrado no PATH. Instale o Python 3.12+ e marque "Add to PATH". & goto :erro)

if not exist "%PY%" (
  echo [1/4] Criando ambiente virtual...
  python -m venv "%SVC%\.venv" || goto :erro
)
echo [2/4] Instalando dependencias...
"%PY%" -m pip install -q --disable-pip-version-check -r "%SVC%\requirements.txt" || goto :erro

echo [3/4] Configurando banco de dados...
"%PY%" scripts\setup.py %* || goto :erro

echo [4/4] Iniciando o auth-service em http://localhost:8001/docs  (Ctrl+C para parar)
cd "%SVC%"
.venv\Scripts\python.exe run.py
goto :fim

:erro
echo.
echo *** Algo falhou. Copie as mensagens acima e envie para ajuda. ***
:fim
endlocal
