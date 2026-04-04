// src/types.ts

export interface ComponentFile {
  path: string;
  type: string;
  content: string;
}

export interface AceternityComponent {
  name: string;
  title: string;
  description: string;
  previewUrl: string;
  dependencies: string[];
  files: ComponentFile[];
}

export interface Registry {
  components: AceternityComponent[];
}