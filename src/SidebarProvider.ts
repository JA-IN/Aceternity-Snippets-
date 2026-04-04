import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Registry } from "./types";

export class SidebarProvider implements vscode.WebviewViewProvider {

  // ── retainContextWhenHidden tells VS Code to keep the webview
  //    alive in memory even when the sidebar is hidden.
  //    This is the simplest fix — the HTML is never wiped so the
  //    "ready" / "loadComponents" cycle never needs to repeat.
  public static readonly viewType = "aceternityUI.sidebar";

  private _view?: vscode.WebviewView;
  private _registry?: Registry;

  constructor(private readonly _extensionUri: vscode.Uri) {
    // ── Load registry ONCE at construction time, not on every
    //    resolveWebviewView call. This is more efficient and means
    //    we always have the data ready regardless of webview lifecycle.
    this._registry = this._loadRegistry();
  }

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
            // Send the registry immediately.
            this._sendRegistryToWebview(webviewView.webview);
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

  // ── Reads registry from disk once and caches it ───────────────────────
  private _loadRegistry(): Registry | undefined {
    try {
      const registryPath = path.join(
        this._extensionUri.fsPath,
        "src",
        "registry.json"
      );
      return JSON.parse(fs.readFileSync(registryPath, "utf8"));
    } catch (err) {
      vscode.window.showErrorMessage(
        `Aceternity UI: Failed to load registry.json — ${err}`
      );
      return undefined;
    }
  }

  // ── Posts registry data into the webview ─────────────────────────────
  private _sendRegistryToWebview(webview: vscode.Webview) {
    if (!this._registry) {
      vscode.window.showErrorMessage(
        "Aceternity UI: Registry is not loaded."
      );
      return;
    }

    webview.postMessage({
      command: "loadComponents",
      components: this._registry.components,
    });
  }

  // ── Injects a component's files into the workspace ───────────────────
  private async _injectComponent(
    componentName: string,
    webview: vscode.Webview
  ) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage(
        "Aceternity UI: Please open a project folder first."
      );
      // ── Reset the webview button — this path never reaches injectResult ──
      this._resetInjectButton(webview, componentName);
      return;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    if (!this._registry) {
      vscode.window.showErrorMessage(
        "Aceternity UI: Registry is not loaded."
      );
      this._resetInjectButton(webview, componentName);
      return;
    }

    const component = this._registry.components.find(
      (c) => c.name === componentName
    );

    if (!component) {
      vscode.window.showErrorMessage(
        `Aceternity UI: Component "${componentName}" not found.`
      );
      this._resetInjectButton(webview, componentName);
      return;
    }

    // ── Step 6: Ensure lib/utils.ts exists before writing any files ────────
    // All Aceternity components rely on the cn() helper from lib/utils.ts.
    // We create it automatically if absent so users don't hit a red import
    // error immediately after injection.
    await this._ensureUtilsFile(workspaceRoot);

    const writtenPaths: string[] = [];

    for (const file of component.files) {
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
    const pm = this._detectPackageManager(workspaceRoot);
    const depList = component.dependencies.join(" ");
    const choice = await vscode.window.showInformationMessage(
      `✅ ${component.title} injected!`,
      { modal: true, detail: `Install dependencies now?\n${pm} install ${depList}` },
      "Install",
      "Skip"
    );

    if (choice === "Install") {
      // ── Open an integrated terminal and run the install command ─────
      // createTerminal + sendText is the VS Code-idiomatic way to do this;
      // it lets the user see output and interact if prompted.
      const terminal = vscode.window.createTerminal("Aceternity UI: Install");
      terminal.show(true); // true = preserve focus on the editor
      terminal.sendText(`${pm} install ${depList}`);
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