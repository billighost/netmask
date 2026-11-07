; Branding and readable welcome copy. Uses Tauri's standard native installer flow.
!ifndef MUI_WELCOMEPAGE_TITLE
  !define MUI_WELCOMEPAGE_TITLE "Welcome to NetMask"
!endif
!ifndef MUI_WELCOMEPAGE_TEXT
  !define MUI_WELCOMEPAGE_TEXT "Install NetMask for your Windows account.$\r$\n$\r$\nReview local connection history, prepare for calls, build measured evidence, and control what NetMask shows.$\r$\n$\r$\nLocal labels do not change your router's broadcast Wi-Fi name or provide anonymity."
!endif
!ifndef MUI_FINISHPAGE_TITLE
  !define MUI_FINISHPAGE_TITLE "Installation complete"
!endif
!ifndef MUI_FINISHPAGE_TEXT
  !define MUI_FINISHPAGE_TEXT "NetMask has been installed successfully.$\r$\n$\r$\nClick Finish to close Setup. Leave Launch NetMask now checked to open the app."
!endif
!ifndef MUI_FINISHPAGE_RUN_TEXT
  !define MUI_FINISHPAGE_RUN_TEXT "Launch NetMask now"
!endif

!macro NSIS_HOOK_PREINSTALL
  ${If} $UpdateMode = 1
    !insertmacro MUI_HEADER_TEXT "Updating NetMask" "Keeping your network aliases, settings, and shortcuts."
    DetailPrint "Updating NetMask in place. Network aliases will not be restored or removed."
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; The old executable is removed during some upgrade paths. Do not run
  ; user-requested uninstall recovery while an update is replacing the app.
  ${If} $UpdateMode = 1
    Goto netmask_uninstall_done
  ${EndIf}
  ; Restore every recoverable local network label before the executable is
  ; removed. Recovery data lives outside $INSTDIR, so a cancelled permission
  ; prompt or unavailable network remains recoverable after reinstall.
  IfFileExists "$INSTDIR\netmask.exe" 0 netmask_uninstall_done
  ExecWait '"$INSTDIR\netmask.exe" --nm-uninstall' $0
  StrCmp $0 0 netmask_uninstall_done
  IfSilent netmask_uninstall_done 0
  MessageBox MB_ICONEXCLAMATION|MB_OK "NetMask could not restore every network name. Your recovery records were kept and can be restored after reinstalling NetMask."
netmask_uninstall_done:
!macroend
