@echo off
rem ==========================================================================
rem  Piensa Digital AI - abre este documento en el editor con guardado automatico.
rem  Doble clic. Deja la ventana abierta mientras editas; cerrala al terminar.
rem ==========================================================================
chcp 65001 >nul
title Editor de documentos - Piensa Digital AI
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No se encontro Node.js en esta computadora.
  echo   Es lo unico que hace falta para que el editor guarde los cambios.
  echo.
  echo   1. Instalalo desde https://nodejs.org  ^(boton "LTS"^).
  echo   2. Volve a abrir este archivo con doble clic.
  echo.
  pause
  exit /b 1
)

if not exist "_editor\serve.js" (
  echo.
  echo   Falta la carpeta _editor junto a este archivo.
  echo   Pedile a Claude que la regenere con new-document.js --solo-editor.
  echo.
  pause
  exit /b 1
)

node "_editor\serve.js" "." 8080 --open working.html
if errorlevel 1 pause
