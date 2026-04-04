// src/types.ts

// ── Aceternity public registry index ──────────────────────────────────
// Returned by: https://ui.aceternity.com/registry
// This is the lightweight listing — no source code, just metadata.

export interface RegistryIndexItem {
  name: string;
  type: string;
  dependencies?: string[];
  devDependencies?: string[];
  registryDependencies?: string[];
  files: { path: string; type: string }[];
}

export interface RegistryIndex {
  name: string;
  homepage: string;
  items: RegistryIndexItem[];
}

// ── Per-component detail ──────────────────────────────────────────────
// Returned by: https://ui.aceternity.com/registry/[name].json
// This adds full source code + title + author to each file entry.

export interface ComponentFile {
  path: string;
  type: string;
  content: string;
  target?: string;
}

export interface ComponentDetail {
  name: string;
  type: string;
  title?: string;
  author?: string;
  dependencies?: string[];
  devDependencies?: string[];
  registryDependencies?: string[];
  files: ComponentFile[];
}

// ── Card data sent to the webview ─────────────────────────────────────
// Simplified shape that the sidebar HTML knows how to render.

export interface SidebarComponent {
  name: string;
  title: string;
  dependencies: string[];
}