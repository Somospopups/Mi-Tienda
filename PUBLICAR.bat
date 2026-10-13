@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
if errorlevel 1 (
  echo [ERROR] No se pudo entrar en la carpeta del repositorio.
  exit /b 1
)

echo.
echo Mi-Tienda POPUPS - publicacion segura v0.92.0
echo Este proceso no aplica SQL y nunca usa push --force.
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git no esta instalado o no esta en PATH.
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado o no esta en PATH.
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm no esta instalado o no esta en PATH.
  exit /b 1
)

for /f "delims=" %%B in ('git branch --show-current') do set "BRANCH=%%B"
if /I not "%BRANCH%"=="main" (
  echo [ERROR] Esta ayuda publica solo desde la rama main. Rama actual: %BRANCH%
  exit /b 1
)

echo [1/10] Estado actual del repositorio:
git status --short
if errorlevel 1 exit /b 1

echo.
echo Revisa archivos sensibles, credenciales y cambios ajenos antes de continuar.
set /p "CONTINUAR=¿Sincronizar con origin/main y ejecutar las validaciones? (S/N): "
if /I not "%CONTINUAR%"=="S" (
  echo Cancelado. No se hicieron cambios en Git.
  exit /b 0
)

echo.
echo [2/10] Descargando referencias remotas...
git fetch origin
if errorlevel 1 (
  echo [ERROR] git fetch fallo. No se continua.
  exit /b 1
)

rem El rebase exige un arbol limpio. Guardamos temporalmente cambios rastreados y nuevos.
set "HAS_CHANGES=0"
set "STASHED=0"
set "STATUS_FILE=%TEMP%\mitienda-status-%RANDOM%-%RANDOM%.txt"
git status --porcelain > "%STATUS_FILE%"
for %%I in ("%STATUS_FILE%") do if %%~zI GTR 0 set "HAS_CHANGES=1"
del "%STATUS_FILE%" >nul 2>nul
if "%HAS_CHANGES%"=="1" (
  echo.
  echo Guardando temporalmente los cambios locales para sincronizar...
  git stash push --include-untracked -m "Mi-Tienda PUBLICAR pre-rebase"
  if errorlevel 1 (
    echo [ERROR] No se pudieron guardar los cambios locales. No se continua.
    exit /b 1
  )
  set "STASHED=1"
)

echo.
echo [3/10] Rebase normal sobre origin/main...
git rebase origin/main
if errorlevel 1 (
  echo [ERROR] Rebase detenido. No se hara commit ni push.
  git rebase --abort >nul 2>nul
  if "%STASHED%"=="1" (
    echo Restaurando los cambios locales guardados...
    git stash pop
    if errorlevel 1 echo [AVISO] Hubo conflictos al restaurar el stash; resuelvelos manualmente.
  )
  exit /b 1
)

if "%STASHED%"=="1" (
  echo.
  echo Restaurando los cambios locales...
  git stash pop
  if errorlevel 1 (
    echo [ERROR] No se pudo restaurar el stash sin conflictos.
    echo Resuelve los conflictos manualmente. No se hara commit ni push.
    exit /b 1
  )
)

echo.
echo [4/10] Preparando dependencias de prueba...
if not exist "node_modules\@playwright\test\package.json" (
  echo Instalando dependencias fijadas en package-lock.json...
  call npm ci
  if errorlevel 1 (
    echo [ERROR] npm ci fallo. No se continua.
    exit /b 1
  )
)
call npx playwright install chromium
if errorlevel 1 (
  echo [ERROR] No se pudo preparar Chromium para Playwright.
  exit /b 1
)

echo.
echo [5/10] Validando sintaxis JavaScript inline...
call npm run check:syntax
if errorlevel 1 (
  echo [ERROR] Fallo la comprobacion de sintaxis. No se hizo commit ni push.
  exit /b 1
)

echo.
echo [6/10] Validando auth cloud, cambio de clave, vidrieras y compra...
call npm run test:release -- --reporter=line
if errorlevel 1 (
  echo [ERROR] Fallo la suite de release. No se hara commit ni push.
  echo Revisa el estado de auth, catalogo, carrito y checkout antes de volver a ejecutar este archivo.
  exit /b 1
)

echo.
echo [7/10] Ejecutando la suite completa de Playwright...
call npm test -- --reporter=line
if errorlevel 1 (
  echo [ERROR] Fallo la suite completa. No se hara commit ni push.
  exit /b 1
)

echo.
echo [8/10] Revisa los cambios antes de stagear:
git status --short
set /p "STAGEAR=¿Agregar al commit los cambios revisados con git add -A? (S/N): "
if /I not "%STAGEAR%"=="S" (
  echo Cancelado antes del staging y commit.
  exit /b 0
)
git add -A
if errorlevel 1 (
  echo [ERROR] git add fallo.
  exit /b 1
)
git diff --cached --check
if errorlevel 1 (
  echo [ERROR] El diff tiene errores de whitespace. Revisa el staging.
  exit /b 1
)
git status --short
set /p "MENSAJE=Mensaje del commit: "
if "%MENSAJE%"=="" (
  echo [ERROR] El mensaje del commit no puede quedar vacio.
  exit /b 1
)
git commit -m "%MENSAJE%"
if errorlevel 1 (
  echo [ERROR] No se pudo crear el commit. No se hizo push.
  exit /b 1
)

echo.
echo [9/10] Creando paquete web y migraciones revisables...
where powershell >nul 2>nul
if errorlevel 1 (
  echo [ERROR] PowerShell no esta disponible; se conserva el commit pero no se hace push.
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Compress-Archive -Path @('index.html','assets','guia','README.md','MANUAL_POPUPS.md','CHANGELOG.md','PUBLICAR.bat','supabase/README.md','supabase/super-admin-secure.sql','supabase/rotate-admin-pin.template.sql','supabase/api_key_change.sql') -DestinationPath 'PUBLICACION-v0.92.0.zip' -Force"
if errorlevel 1 (
  echo [ERROR] No se pudo crear el ZIP. El commit existe, pero no se hara push.
  exit /b 1
)

echo Paquete creado: PUBLICACION-v0.92.0.zip
echo.
set /p "PUSH=¿Hacer push normal a origin/main ahora? (S/N): "
if /I not "%PUSH%"=="S" (
  echo Push omitido. El commit y el ZIP quedan locales.
  exit /b 0
)

echo.
echo [10/10] Push normal a origin/main...
git push origin main
if errorlevel 1 (
  echo [ERROR] El push no se completo. No se usa push --force.
  echo Sincroniza origin/main y revisa el commit antes de volver a publicar.
  exit /b 1
)

echo.
echo Publicacion completada. Revisa PUBLICACION-v0.92.0.zip.
exit /b 0
