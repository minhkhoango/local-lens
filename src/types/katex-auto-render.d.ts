declare module 'katex/dist/contrib/auto-render.mjs' {
  type RenderMathInElement = (
    element: HTMLElement,
    options?: {
      delimiters?: Array<{
        left: string;
        right: string;
        display: boolean;
      }>;
      throwOnError?: boolean;
      errorColor?: string;
      macros?: Record<string, string>;
      strict?: boolean | 'ignore' | 'warn' | 'error';
    },
  ) => void;

  const renderMathInElement: RenderMathInElement;
  export default renderMathInElement;
}
