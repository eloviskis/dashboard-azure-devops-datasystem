import React from 'react';

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Nome identificador para facilitar diagnóstico do erro */
  name?: string;
};

type State = {
  hasError: boolean;
  error?: Error;
  componentStack?: string;
};

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const boundaryName = this.props.name ?? 'desconhecido';
    console.error(`[ErrorBoundary:${boundaryName}] Erro capturado:`, error.message);
    console.error(`[ErrorBoundary:${boundaryName}] Pilha de componentes:`, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? '' });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const { error, componentStack } = this.state;
      const boundaryName = this.props.name ?? 'Seção';

      return (
        <div className="bg-red-900/40 border border-red-500 text-white p-4 rounded-lg my-4">
          <div className="font-bold text-red-300 mb-1">⚠️ Falha ao renderizar: {boundaryName}</div>
          {error && (
            <div className="text-sm text-red-200 mb-2 font-mono bg-black/30 px-3 py-2 rounded break-all">
              {error.message}
            </div>
          )}
          {componentStack && (
            <details className="mt-2">
              <summary className="text-xs text-red-400 cursor-pointer hover:text-red-300">
                Ver pilha de componentes (para diagnóstico)
              </summary>
              <pre className="text-xs text-red-300 mt-1 bg-black/30 px-3 py-2 rounded overflow-x-auto whitespace-pre-wrap">
                {componentStack}
              </pre>
            </details>
          )}
          <div className="text-xs text-red-400 mt-2">
            Tente atualizar a página. Se o erro persistir, reporte a mensagem acima.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
