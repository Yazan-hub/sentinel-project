// Types for ifc-to-frag.mjs (the web tests read a real .frag through it).
export function ifcBytesToFrag(bytes: Uint8Array | ArrayBuffer): Promise<Uint8Array>;
export function ifcToFrag(ifcPath: string): Promise<Uint8Array>;
