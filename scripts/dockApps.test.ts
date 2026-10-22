import { describe, expect, test } from "bun:test";
import {
	isSameWebApp,
	mergeTrayApps,
	pinnableApp,
	selectDockTrayApps,
	type AppInfo,
	type TrayApp
} from "../src/dockApps";
const tray: TrayApp = {
	name: "Discord",
	path: "C:\\Apps\\Discord.exe",
	tray_ids: ["42"],
	window_handles: [11, 12]
};
const windowApp: AppInfo = {
	name: "Discord",
	path: "com.squirrel.Discord.Discord",
	icon: null,
	is_running: true,
	hwnd: 11,
	all_hwnds: [[11, "Discord"]]
};
describe("dock tray lifecycle", () => {
	test("does not show every tray app when the dock starts", () => {
		const selected = selectDockTrayApps([], [tray], new Set(), () => false);
		expect(selected.visible).toEqual([]);
		expect(selected.observed.size).toBe(0);
	});
	test("shows an unpinned app only after its window was observed, then forgets it on exit", () => {
		const opened = selectDockTrayApps([windowApp], [tray], new Set(), () => false);
		expect(opened.visible).toEqual([tray]);
		const background = selectDockTrayApps([], [tray], opened.observed, () => false);
		expect(mergeTrayApps([], background.visible)[0].is_background).toBe(true);
		const exited = selectDockTrayApps([], [], background.observed, () => false);
		expect(exited.observed.size).toBe(0);
		expect(selectDockTrayApps([], [tray], exited.observed, () => false).visible).toEqual([]);
	});
	test("shows a pinned app's background dot immediately at startup", () => {
		const selected = selectDockTrayApps([], [tray], new Set(), (app) => app.path === tray.path);
		expect(mergeTrayApps([], selected.visible)[0]).toMatchObject({
			is_background: true,
			tray_ids: ["42"]
		});
		expect(selected.observed.size).toBe(0);
	});
	test("does not treat an unrelated same-name window as opening the tray app", () => {
		const other = { ...windowApp, hwnd: 99, all_hwnds: [[99, "Discord"]] as [number, string][] };
		expect(selectDockTrayApps([other], [tray], new Set(), () => false).visible).toEqual([]);
	});
	test("keeps a zero-window app running with exactly the tray identity", () => {
		const apps = mergeTrayApps([], [tray]);
		expect(apps).toHaveLength(1);
		expect(apps[0]).toMatchObject({
			is_running: true,
			is_background: true,
			all_hwnds: [],
			tray_ids: ["42"]
		});
		expect(apps[0].hwnd).toBeUndefined();
	});
	test("reconciles a shell-id window with its executable tray without a duplicate", () => {
		const apps = mergeTrayApps([windowApp], [tray]);
		expect(apps).toHaveLength(1);
		expect(apps[0]).toMatchObject({ path: windowApp.path, is_background: false, tray_ids: ["42"] });
		expect(windowApp.tray_ids).toBeUndefined();
	});
	test("returns to background and disappears after a true exit", () => {
		expect(mergeTrayApps([windowApp], [tray])[0].is_background).toBe(false);
		expect(mergeTrayApps([], [tray])[0].is_background).toBe(true);
		expect(mergeTrayApps([], [])).toEqual([]);
	});
	test("does not collapse independent PWAs or attach a shared tray to one of them", () => {
		const second = {
			...windowApp,
			name: "Other PWA",
			path: "other-id",
			hwnd: 12,
			all_hwnds: [[12, "Other"]] as [number, string][]
		};
		const apps = mergeTrayApps([windowApp, second], [tray]);
		expect(apps).toHaveLength(2);
		expect(apps.every((a) => !a.is_background && a.tray_ids === undefined)).toBe(true);
	});
	test("does not match a different process by display name", () => {
		const other = { ...windowApp, hwnd: 99, all_hwnds: [[99, "Discord"]] as [number, string][] };
		expect(mergeTrayApps([other], [tray])).toHaveLength(2);
	});
});

describe("web apps", () => {
	const app = (name: string, path: string): AppInfo => ({ name, path, icon: null, is_running: false });
	const chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe";
	const installed = [
		app("Google Chrome", "Chrome"),
		app("Netflix", "Chrome._crx_eppojlglocmnohnlnionkobfln"),
		app("Spotify", "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify")
	];

	test("pins a running web app as the web app, not its browser", () => {
		const window = { ...app("Netflix", chrome), is_running: true, executable: "chrome.exe", hwnd: 7 };
		expect(pinnableApp(window, installed).path).toBe("Chrome._crx_eppojlglocmnohnlnionkobfln");
		// The browser's own window, and a web app that isn't installed, pin as they are.
		expect(pinnableApp(app("Google Chrome", chrome), installed).path).toBe(chrome);
		expect(pinnableApp(app("YouTube", chrome), installed).path).toBe(chrome);
		// Other apps are untouched.
		const spotify = app("Spotify", "C:\Spotify\Spotify.exe");
		expect(pinnableApp(spotify, installed)).toBe(spotify);
	});

	test("matches a pinned web app with its running window by name", () => {
		const pin = app("Netflix", "Chrome._crx_eppojlglocmnohnlnionkobfln");
		expect(isSameWebApp(pin, app("Netflix", chrome))).toBe(true);
		expect(isSameWebApp(app("Netflix", chrome), pin)).toBe(true);
		// Another web app's window, or the browser itself, isn't it.
		expect(isSameWebApp(pin, app("YouTube", chrome))).toBe(false);
		expect(isSameWebApp(pin, app("Google Chrome", chrome))).toBe(false);
		// Two plain apps aren't web apps at all.
		expect(isSameWebApp(app("Spotify", "C:\Spotify\Spotify.exe"), app("Spotify", "C:\Spotify\Spotify.exe"))).toBe(false);
	});
});
