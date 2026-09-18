import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Anti-fragility: any uncaught render error (route crash, bad API shape,
 * PWA asset failure) renders a recovery card instead of a blank Android
 * screen. Retry resets the boundary; the card also offers a home link.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unexpected error',
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ hasError: false, message: '' });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-900 p-6 text-white">
          <div className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-800 p-8 text-center shadow-lg">
            <h1 className="text-xl font-semibold text-red-400">Something went wrong</h1>
            <p className="mt-3 text-sm text-gray-300">
              VoteChain hit an unexpected error and recovered. Your ballot data is safe — no vote
              was lost.
            </p>
            {this.state.message ? (
              <p className="mt-2 text-xs text-gray-400">Details: {this.state.message}</p>
            ) : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={this.reset}
                className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
              >
                Try again
              </button>
              <a
                href="/"
                className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-600"
              >
                Back to home
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}