import React from 'react';

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: Error;
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
    // Log para inspeção futura
    console.error('ErrorBoundary capturou um erro:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="bg-red-700 text-white p-4 rounded-lg">
            <div className="font-bold mb-2">Falha ao renderizar esta seção</div>
            <div className="text-sm">Tente atualizar a página. Se persistir, entre em contato.</div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
