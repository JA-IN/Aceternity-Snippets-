import * as vscode from "vscode";
import { SidebarProvider } from "./SidebarProvider";

export function activate(context: vscode.ExtensionContext) {
  console.log("Aceternity UI Manager is now active.");

  const sidebarProvider = new SidebarProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      sidebarProvider,
      {
        // This is the second place retainContextWhenHidden must be declared.
        // VS Code checks this option at registration time, not just on the
        // webview itself. Both declarations are required for it to work.
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "aceternity-ui-manager.helloWorld",
      () => {
        vscode.window.showInformationMessage(
          "Hello World from aceternity-ui-manager!"
        );
      }
    )
  );
}

export function deactivate() {}
