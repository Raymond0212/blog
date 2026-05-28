/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module "*.mdx" {
  const MDXComponent: (props: Record<string, unknown>) => JSX.Element;
  export default MDXComponent;
}
