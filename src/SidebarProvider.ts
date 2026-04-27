import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  RegistryIndex,
  RegistryIndexItem,
  ComponentDetail,
  SidebarComponent,
} from "./types";

// ── Global mapping for components whose registry names differ from their slugs
const SLUG_OVERRIDES: Record<string, string> = {
  "grid": "layout-grid",
  "moving-line": "tracing-beam",
  "glowing-stars": "glowing-stars-background",
  "parallax-scroll-2": "hero-parallax",
  "lamp": "lamp-effect",
  "3d-card": "3d-card-effect",
  "input": "placeholders-and-vanish-input",
  "label": "text-generate-effect",
  "globe": "github-globe",
  "shooting-stars": "shooting-stars-and-meteors",
  "stars-background": "stars-background",
  "cover": "container-cover",
};

// ── Base URL for Aceternity's public shadcn-style registry ────────────
const REGISTRY_INDEX_URL = "https://ui.aceternity.com/registry";
const REGISTRY_COMPONENT_URL = (name: string) => {
  const slug = SLUG_OVERRIDES[name] || name;
  return `https://ui.aceternity.com/registry/${slug}.json`;
};

export class SidebarProvider implements vscode.WebviewViewProvider {

  // ── retainContextWhenHidden tells VS Code to keep the webview
  //    alive in memory even when the sidebar is hidden.
  //    This is the simplest fix — the HTML is never wiped so the
  //    "ready" / "loadComponents" cycle never needs to repeat.
  public static readonly viewType = "aceternityUI.sidebar";

  private _view?: vscode.WebviewView;

  // ── In-memory cache of the registry index so we don't re-fetch
  //    every time the sidebar toggles. Cleared on window reload.
  private _cachedIndex?: RegistryIndexItem[];

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    // Store the current view reference — always update it
    // because VS Code may give us a new object each call
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // ── NOTE: retainContextWhenHidden is configured in extension.ts ─────────
    // VS Code expects retainContextWhenHidden to be set as an option when
    // calling registerWebviewViewProvider(), not directly on the view object.

    webviewView.webview.html = this._getHtmlForWebview();

    // ── Re-register the message listener on EVERY resolveWebviewView call.
    //    This is critical. Each time VS Code calls this method, we get a
    //    fresh webviewView object. The old listener is gone. If we don't
    //    re-register, messages from the new webview go unheard.
    this._registerMessageListener(webviewView);
  }

  // ── Extracted into its own method so it's clear this must run
  //    every time resolveWebviewView fires, not just once.
  private _registerMessageListener(webviewView: vscode.WebviewView) {
    webviewView.webview.onDidReceiveMessage(
      (message: { command: string; componentName?: string }) => {
        switch (message.command) {

          case "ready":
            // Webview JS has loaded and is ready to receive data.
            // Fetch from the Aceternity registry and send the result.
            this._fetchAndSendRegistry(webviewView.webview);
            break;

          case "openDocs":
            if (message.componentName) {
              const docSlug = SLUG_OVERRIDES[message.componentName] || message.componentName;
              const url = `https://ui.aceternity.com/components/${docSlug}`;
              vscode.env.openExternal(vscode.Uri.parse(url));
            }
            break;

          case "viewSource":
            if (message.componentName) {
              this._viewSource(message.componentName, webviewView.webview);
            }
            break;

          case "inject":
            if (message.componentName) {
              this._injectComponent(
                message.componentName,
                webviewView.webview
              );
            }
            break;
        }
      }
    );
  }

  // ── Fetches the registry index and sends it to the webview ──────────
  // Uses an in-memory cache so we only hit the network once per session.
  // If the fetch fails (offline), sends an error to the webview which
  // displays an offline message instead of component cards.
  private async _fetchAndSendRegistry(webview: vscode.Webview) {
    // Return from cache if we already have it
    if (this._cachedIndex) {
      webview.postMessage({
        command: "loadComponents",
        components: this._mapIndexToCards(this._cachedIndex),
      });
      return;
    }

    try {
      const response = await fetch(REGISTRY_INDEX_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as RegistryIndex;
      this._cachedIndex = data.items;

      webview.postMessage({
        command: "loadComponents",
        components: this._mapIndexToCards(data.items),
      });
    } catch (err) {
      // ── Offline or network error — tell the webview to show an
      //    offline message instead of component cards.
      webview.postMessage({
        command: "fetchError",
        message: "You are offline or not connected to the internet.",
      });
      vscode.window.showErrorMessage(
        `Aceternity UI: Failed to fetch components — ${err}`
      );
    }
  }

  // ── Converts raw registry index items into the card shape the
  //    webview expects. Generates a display title from the slug name
  //    (e.g., "bento-grid" → "Bento Grid").
  private _mapIndexToCards(items: RegistryIndexItem[]): SidebarComponent[] {
    return items.map((item) => ({
      name: item.name,
      title: this._slugToTitle(item.name),
      dependencies: item.dependencies ?? [],
    }));
  }

  // ── "bento-grid" → "Bento Grid", "3d-card" → "3D Card" ────────────
  private _slugToTitle(slug: string): string {
    return slug
      .split("-")
      .map((word) => {
        // Keep fully numeric tokens (like "3d") uppercase
        if (/^\d/.test(word)) {
          return word.toUpperCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  }

  // ── Fetches the component source code to view without injecting ─────────
  private async _viewSource(componentName: string, webview: vscode.Webview) {
    try {
      const response = await fetch(REGISTRY_COMPONENT_URL(componentName));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const component = (await response.json()) as ComponentDetail;
      
      webview.postMessage({
        command: "showSource",
        componentName,
        files: component.files,
      });
    } catch (err) {
      vscode.window.showErrorMessage(
        `Aceternity UI: Failed to fetch source for "${componentName}" — ${err}`
      );
      // Reset the button state in case it was stuck on loading
      webview.postMessage({
        command: "resetSourceButton",
        componentName,
      });
    }
  }

  // ── Injects a component's files into the workspace ───────────────────
  // Phase 2: Fetches full source code from /registry/[name].json on demand,
  // rather than reading from a local registry.json.
  private async _injectComponent(
    componentName: string,
    webview: vscode.Webview
  ) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage(
        "Aceternity UI: Please open a project folder first."
      );
      this._resetInjectButton(webview, componentName);
      return;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    // ── Fetch the full component detail (source code) from the API ────
    let component: ComponentDetail;
    try {
      const response = await fetch(REGISTRY_COMPONENT_URL(componentName));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      component = (await response.json()) as ComponentDetail;
    } catch (err) {
      vscode.window.showErrorMessage(
        `Aceternity UI: Failed to fetch "${componentName}" — ${err}`
      );
      this._resetInjectButton(webview, componentName);
      return;
    }

    // ── Ensure lib/utils.ts exists before writing any files ───────────
    // All Aceternity components rely on the cn() helper from lib/utils.ts.
    // We create it automatically if absent so users don't hit a red import
    // error immediately after injection.
    await this._ensureUtilsFile(workspaceRoot);

    const writtenPaths: string[] = [];

    for (const file of component.files) {
      // The API returns paths like "components/ui/bento-grid.tsx"
      const targetPath = path.join(workspaceRoot, file.path);
      const targetDir = path.dirname(targetPath);

      fs.mkdirSync(targetDir, { recursive: true });

      if (fs.existsSync(targetPath)) {
        const choice = await vscode.window.showWarningMessage(
          `"${file.path}" already exists. Overwrite?`,
          { modal: true },
          "Overwrite"
        );
        if (choice !== "Overwrite") {
          continue;
        }
      }

      fs.writeFileSync(targetPath, file.content, "utf8");
      writtenPaths.push(file.path);
    }

    if (writtenPaths.length === 0) {
      // ── User cancelled all overwrites — nothing was written.
      // We must reset the button here; injectResult will never be sent.
      vscode.window.showInformationMessage("Aceternity UI: Injection cancelled. No files were modified.");
      this._resetInjectButton(webview, componentName);
      return;
    }

    const firstFile = path.join(workspaceRoot, writtenPaths[0]);
    const doc = await vscode.workspace.openTextDocument(firstFile);
    await vscode.window.showTextDocument(doc);

    webview.postMessage({
      command: "injectResult",
      componentName,
      success: true,
      files: writtenPaths,
    });

    // ── Ask the user whether to auto-install dependencies ───────────────
    // modal: true is required — the `detail` subtitle only renders in modal
    // dialogs, and non-modal toasts can be silently dismissed before the
    // user sees the buttons. This is a deliberate one-time decision anyway.
    const deps = component.dependencies ?? [];
    if (deps.length > 0) {
      const pm = this._detectPackageManager(workspaceRoot);
      const depList = deps.join(" ");
      const displayTitle = component.title ?? this._slugToTitle(componentName);
      const choice = await vscode.window.showInformationMessage(
        `✅ ${displayTitle} injected!`,
        { modal: true, detail: `Install dependencies now?\n${pm} install ${depList}` },
        "Install",
        "Skip"
      );

      if (choice === "Install") {
        const terminal = vscode.window.createTerminal("Aceternity UI: Install");
        terminal.show(true);
        terminal.sendText(`${pm} install ${depList}`);
      }
    } else {
      const displayTitle = component.title ?? this._slugToTitle(componentName);
      vscode.window.showInformationMessage(
        `✅ ${displayTitle} injected! No extra dependencies needed.`
      );
    }
  }

  // ── Resets the inject button in the webview to its idle state ────────────
  // Called from every early-return path so the button is never permanently
  // frozen on "⏳ Injecting...". The webview handles "resetButton" to restore
  // the button label and re-enable it.
  private _resetInjectButton(webview: vscode.Webview, componentName: string) {
    webview.postMessage({
      command: "resetButton",
      componentName,
    });
  }

  // ── Detects which package manager the workspace uses ─────────────────────
  // Checks for lock files in priority order. Falls back to npm.
  // Keeps the dep-install prompt accurate without any user configuration.
  private _detectPackageManager(workspaceRoot: string): string {
    const lockFiles: [string, string][] = [
      ["bun.lockb",        "bun"],
      ["pnpm-lock.yaml",   "pnpm"],
      ["yarn.lock",        "yarn"],
    ];

    for (const [lockFile, pm] of lockFiles) {
      if (fs.existsSync(path.join(workspaceRoot, lockFile))) {
        return pm;
      }
    }

    return "npm"; // default
  }

  // ── Ensures lib/utils.ts with the standard cn() helper exists ────────────
  // Called before every inject. Creates the file silently if absent.
  // If the file is already there, this is a no-op.
  private async _ensureUtilsFile(workspaceRoot: string): Promise<void> {
    const utilsPath = path.join(workspaceRoot, "lib", "utils.ts");

    if (fs.existsSync(utilsPath)) {
      // Already present — nothing to do.
      return;
    }

    const utilsContent = [
      'import { type ClassValue, clsx } from "clsx";',
      'import { twMerge } from "tailwind-merge";',
      "",
      "export function cn(...inputs: ClassValue[]) {",
      "  return twMerge(clsx(inputs));",
      "}",
      "",
    ].join("\n");

    fs.mkdirSync(path.dirname(utilsPath), { recursive: true });
    fs.writeFileSync(utilsPath, utilsContent, "utf8");

    vscode.window.showInformationMessage(
      "Aceternity UI: Created lib/utils.ts with the cn() utility."
    );
  }

  private _getHtmlForWebview(): string {
    const nonce = getNonce();

    const htmlPath = path.join(
      this._extensionUri.fsPath,
      "src",
      "webview",
      "sidebar.html"
    );

    let html = fs.readFileSync(htmlPath, "utf8");

    const csp = `
      <meta
        http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src 'unsafe-inline';
                 media-src https: data:;
                 img-src https: data:;
                 script-src 'nonce-${nonce}';"
      />`;

    html = html.replace("</head>", `${csp}\n</head>`);
    html = html.replace(/NONCE_PLACEHOLDER/g, nonce);

    return html;
  }
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}