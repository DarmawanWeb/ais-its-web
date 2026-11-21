export declare const API_TARGETS: readonly { name: string; candidates: readonly string[] }[];
export declare const GENERATED_DIR: string;
export declare function servicesDir(): string;
export declare function resolveApiTargets(): {
  found: { name: string; spec: string }[];
  skipped: { name: string; candidates: string[] }[];
  dir: string;
};
