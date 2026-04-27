# Aceternity UI Manager

**Aceternity UI Manager** is a Visual Studio Code extension designed to browse, preview, and seamlessly inject [Aceternity UI](https://ui.aceternity.com/) components directly into your workspace. 

## Features

- **Component Browser Sidebar**: Quickly search and explore all available Aceternity UI components directly inside your VS Code Activity Bar.
- **One-Click Injection**: Inject components straight into your project. The extension automatically fetches the component's source code and places it in your workspace.
- **Smart Dependencies**: The extension detects your package manager (npm, pnpm, yarn, bun) and automatically prompts you to install any required dependencies for the injected component.
- **Automatic Setup**: Automatically creates and configures the `lib/utils.ts` and `cn` utility if they don't already exist in your project.
- **Live Previews & Source**: View component documentation on the official website or view the raw source code right inside VS Code before injecting.

## Getting Started

1. Open your project folder in VS Code.
2. Click the **Aceternity UI** icon in the Activity Bar on the left.
3. Browse the components, read the docs, or inject them into your active project.

## Requirements

- A workspace must be open in VS Code to inject components.
- An active internet connection is required to fetch component data from the Aceternity registry.

## Known Issues

- Please report any issues or bugs on our [GitHub Repository](https://github.com/JA-IN/Aceternity-Snippets-).

## Release Notes

### 0.0.1
- Initial release of the Aceternity UI Manager extension.
- Added live fetching from the Aceternity registry.
- Added automatic dependency installation and file generation.
