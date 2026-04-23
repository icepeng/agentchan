import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onError?: (error: Error) => void;
  fallback: (error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Scopes renderer throws so they never take down the host shell. The `key`
 * prop on the outer boundary (use `slug`) recycles the instance on project
 * switch — otherwise a persistent error would survive the switch and hide
 * the next project's renderer.
 */
export class RendererErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    this.props.onError?.(error);
  }

  override render(): ReactNode {
    if (this.state.error) return this.props.fallback(this.state.error);
    return this.props.children;
  }
}
