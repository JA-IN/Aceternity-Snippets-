# Aceternity Snippets

This is a VS Code extension for managing and injecting Aceternity UI snippets directly into your projects.

## Current Work Status (As of Latest Update)

- **Initialization**: The VS Code extension foundation has been set up successfully.
- **Webview Sidebar**: A custom sidebar UI has been registered (`aceternityUI.sidebar`) where the available snippets and components will be displayed.
- **Component Injection Core**: The foundational logic is implemented to inject Aceternity UI components into the user's workspace. This includes the automatic creation of the required `lib/utils.ts` and configuring the `twMerge`/`clsx` setup.
- **Commands**: A basic "Hello World" command (`aceternity-ui-manager.helloWorld`) is registered for initial testing.
- **Repository Setup**: The code has been successfully pushed to the GitHub repository. You can view the live repository here: [Aceternity-Snippets-](https://github.com/JA-IN/Aceternity-Snippets-).

## How to Start and Run the Extension

### Setup

1. Open the project folder (`d:\programming\Projects\vs_code_Extention`) in VS Code.
2. Open a terminal within VS Code and install the necessary dependencies:
   ```bash
   npm install
   ```

### Get up and running straight away

1. Press `F5` on your keyboard. This opens a new top-level VS Code window with your extension loaded (known as the Extension Development Host).
2. The **Aceternity Snippets** sidebar will be available in the activity bar (look for the custom icon).
3. You can also run the test command by opening the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac) and typing `Hello World`.
4. Any `console.log` statements within the extension code will output to the VS Code Debug Console in your main window.

### Making Changes and Debugging

1. Make your changes to the TypeScript code in the `src/` directory (e.g., `src/extension.ts` or `src/SidebarProvider.ts`).
2. Reload the Extension Development Host window (press `Ctrl+R` or `Cmd+R` on Mac in the host window) to load your changes instantly. Alternatively, you can use the restart button on the debug toolbar in your main VS Code window.

## Known Issues

- None currently identified.

## Following extension guidelines

Ensure that you follow the best practices for creating your extension:
* [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
