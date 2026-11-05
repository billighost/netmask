; Branding and readable welcome copy. Uses Tauri's standard native installer flow.
!ifndef MUI_WELCOMEPAGE_TITLE
  !define MUI_WELCOMEPAGE_TITLE "Welcome to NetMask"
!endif
!ifndef MUI_WELCOMEPAGE_TEXT
  !define MUI_WELCOMEPAGE_TEXT "Install NetMask for your Windows account.$\r$\n$\r$\nManage local network display names, inspect your connection, and control what NetMask shows during screen sharing.$\r$\n$\r$\nYour router's broadcast Wi-Fi name stays the same."
!endif
!ifndef MUI_FINISHPAGE_TITLE
  !define MUI_FINISHPAGE_TITLE "NetMask is ready"
!endif

!macro NSIS_HOOK_PREUNINSTALL
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
