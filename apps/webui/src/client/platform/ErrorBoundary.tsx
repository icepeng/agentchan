import { Component, type ErrorInfo, type ReactNode } from "react";

export interface FallbackProps {
  error: unknown;
  resetErrorBoundary: () => void;
}

type FallbackComponent = (props: FallbackProps) => ReactNode;

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent: FallbackComponent;
  onError?: (error: unknown, info: ErrorInfo) => void;
  onReset?: () => void;
  resetKeys?: readonly unknown[];
}

interface ErrorBoundaryState {
  error: unknown;
  hasError: boolean;
}

function hasResetKeysChanged(
  prev: readonly unknown[] = [],
  next: readonly unknown[] = [],
): boolean {
  return prev.length !== next.length || prev.some((item, index) => !Object.is(item, next[index]));
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, hasError: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error, hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  override componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (
      this.state.hasError &&
      hasResetKeysChanged(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.resetErrorBoundary();
    }
  }

  resetErrorBoundary = () => {
    this.props.onReset?.();
    this.setState({ error: null, hasError: false });
  };

  override render() {
    if (this.state.hasError) {
      const Fallback = this.props.FallbackComponent;
      return (
        <Fallback
          error={this.state.error}
          resetErrorBoundary={this.resetErrorBoundary}
        />
      );
    }

    return this.props.children;
  }
}
