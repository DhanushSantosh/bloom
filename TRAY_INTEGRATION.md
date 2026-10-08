# Dock background apps and system actions

An app with a live notification icon remains in the dock after its last window
closes. One grey dot indicates background activity. Windowed apps retain their
normal window dots and previews. Pinned entries receive the same live state.
Running unpinned apps appear to the right of the pinned group, separated by a
thin theme-aware divider whenever both groups are present.

- Click a background app to invoke its notification icon's default action.
- Right-click a background app to request its native tray context menu.
- Shift-right-click opens Bloom's menu for pinning and icon customization.
- An app with several tray icons has a separate menu entry for each icon.
- Start's context menu includes Task Manager, Disk Management, Device Manager,
  Computer Management and Windows settings shortcuts. The dock background menu
  includes Task Manager and Taskbar Settings.

## Implementation and compatibility

`tray.rs` reads notification-icon candidates from Windows 11's
`HKCU\Control Panel\NotifyIconSettings`. Each candidate must match a running
process path and pass `Shell_NotifyIconGetRect`; historical entries alone never
count as running. The frontend reconciles tray owners with actual window handles,
including applications launched through shell IDs. A shared browser tray does
not combine multiple PWAs.

Native interactions use UI Automation. Windows reports the chevron rectangle for
an icon hidden in the overflow, so hidden icons are matched by the live
`UIOrderList` order against Explorer's overflow buttons, with equal-count and
accessible-label checks before invocation. Promoted icons are matched to the
taskbar's XAML controls by screen position, accounting for display scaling.
Failure produces a user-visible error. Menu opening temporarily exposes the
native tray and restores the taskbar on completion or error, without changing
AppBar state or icon promotion preferences. Windows' connection/transaction
timeouts bound UIA provider calls.

The registry layout and Explorer's UIA tree are Windows implementation details.
Windows versions or alternative shells that do not expose them keep the existing
window-based dock behavior. Windows 10 tray discovery is not implemented here.
Background processes without notification icons are not included.

API references:

- [Shell_NotifyIconGetRect](https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shell_notifyicongetrect)
- [IUIAutomationElement3::ShowContextMenu](https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nf-uiautomationclient-iuiautomationelement3-showcontextmenu)

## Validation

Automated checks:

```powershell
bun run build
bun test scripts/dockApps.test.ts
cd src-tauri
cargo check --locked
cargo clippy --locked --all-targets
cargo test --locked
# Optional read-only integration check against the current desktop:
cargo test --locked live_tray_discovery -- --ignored --nocapture
```

Manual acceptance checks (required before merging):

1. Start Discord with one window: one normal dot, no duplicate pinned entry.
2. Close Discord to the tray: one grey dot, no window thumbnail.
3. Right-click its dock icon: Discord's own menu appears and its actions work.
4. Click the background icon: Discord responds through its tray default action.
5. Quit Discord through its native menu: unpinned icon disappears; pinned dot clears
   within the 10-second safety poll.
6. Repeat with an icon in overflow, a promoted icon, and an app with multiple icons.
7. Exit/restart Explorer, exit Bloom during menu opening, and toggle the dock off:
   the taskbar must return to the intended state with no transparent residue.
8. Check Start and dock system actions, including denied UAC and launch errors.
9. Check light/dark themes, large Bloom scale, multiple monitors and mixed DPI.

Live discovery, the Discord background dot, and Discord's native context menu
have been exercised on the development machine. The broader compatibility,
menu-action, and restoration checks above still require end-to-end validation.
