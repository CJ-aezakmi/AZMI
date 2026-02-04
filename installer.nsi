!include "MUI2.nsh"

Name "AEZAKMI Pro"
OutFile "AEZAKMI-Setup.exe"
InstallDir "$PROGRAMFILES64\AEZAKMI"
RequestExecutionLevel admin

!define MUI_ICON "src-tauri\icons\icon.ico"
!define MUI_HEADERIMAGE
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Russian"
!insertmacro MUI_LANGUAGE "English"

Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  
  ; Копируем основное приложение (Tauri создаёт app.exe, переименовываем в AEZAKMI.exe)
  File "/oname=AEZAKMI.exe" "src-tauri\target\x86_64-pc-windows-msvc\release\app.exe"
  
  ; Копируем Node.js portable
  SetOutPath "$INSTDIR\node"
  File /r "node\*.*"
  
  ; Копируем Playwright и браузеры
  SetOutPath "$INSTDIR\playwright-cache"
  File /r "playwright-cache\*.*"
  
  ; Копируем скрипты (опционально)
  SetOutPath "$INSTDIR"
  IfFileExists "scripts\*.*" 0 +3
    SetOutPath "$INSTDIR\scripts"
    File /r /nonfatal "scripts\*.*"
  
  ; Создаём ярлык
  CreateDirectory "$SMPROGRAMS\AEZAKMI"
  CreateShortCut "$SMPROGRAMS\AEZAKMI\AEZAKMI Pro.lnk" "$INSTDIR\AEZAKMI.exe"
  CreateShortCut "$DESKTOP\AEZAKMI Pro.lnk" "$INSTDIR\AEZAKMI.exe"
  
  ; Записываем uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  
  ; Регистрируем в Add/Remove Programs
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AEZAKMI" "DisplayName" "AEZAKMI Pro"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AEZAKMI" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AEZAKMI" "DisplayIcon" "$INSTDIR\AEZAKMI.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AEZAKMI" "Publisher" "AEZAKMI Team"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AEZAKMI" "DisplayVersion" "2.0.3"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\AEZAKMI.exe"
  Delete "$INSTDIR\Uninstall.exe"
  
  RMDir /r "$INSTDIR\node"
  RMDir /r "$INSTDIR\playwright-cache"
  RMDir /r "$INSTDIR\scripts"
  RMDir "$INSTDIR"
  
  Delete "$SMPROGRAMS\AEZAKMI\AEZAKMI Pro.lnk"
  Delete "$DESKTOP\AEZAKMI Pro.lnk"
  RMDir "$SMPROGRAMS\AEZAKMI"
  
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AEZAKMI"
SectionEnd
