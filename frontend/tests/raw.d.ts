/**
 * Vite's `?raw` suffix imports a file's contents as a string. Used for the `.sse`
 * fixtures, which are byte-for-byte captures rather than modules.
 */
declare module '*?raw' {
  const content: string;
  export default content;
}
