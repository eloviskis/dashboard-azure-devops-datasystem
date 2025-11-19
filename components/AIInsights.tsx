import React, { useState, useEffect } from 'react';

interface AIInsightsProps {
  onGenerate: () => void;
  insight: string;
  loading: boolean;
  error: string;
}

const AIInsights: React.FC<AIInsightsProps> = ({ onGenerate, insight, loading, error }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (loading || insight || error) {
      setIsExpanded(true);
    }
  }, [loading, insight, error]);

  const handleCopy = () => {
    if (insight) {
      navigator.clipboard.writeText(insight)
        .then(() => {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        })
        .catch(err => {
          console.error('Falha ao copiar o texto: ', err);
        });
    }
  };

  const formatInsight = (text: string) => {
    return text
      .split('\n')
      .map((line, index) => {
        let formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        if (formattedLine.trim().startsWith('* ')) {
          return <li key={index} className="ml-5 list-disc" dangerouslySetInnerHTML={{__html: formattedLine.substring(2)}} />;
        }
        if (formattedLine.trim().length > 0) {
          return <p key={index} className="mb-2" dangerouslySetInnerHTML={{__html: formattedLine}} />;
        }
        return null;
      })
      .filter(Boolean);
  };

  return (
    <div className="bg-ds-navy/50 p-6 rounded-lg border border-ds-border mb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ds-light-text flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-ds-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Insights com Inteligência Artificial
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onGenerate}
            disabled={loading}
            className="bg-ds-green text-ds-dark-blue font-bold py-2 px-4 rounded-md hover:bg-opacity-80 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[150px]"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-ds-dark-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Analisando...
              </>
            ) : 'Gerar Insights'}
          </button>
          
          {insight && !loading && (
            <button
                onClick={handleCopy}
                className="bg-ds-muted/20 text-ds-light-text font-semibold py-2 px-4 rounded-md hover:bg-ds-muted/40 transition-colors text-sm flex items-center gap-2 min-w-[115px] justify-center"
                aria-label="Copiar insights"
            >
                {isCopied ? (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-ds-green" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Copiado!
                    </>
                ) : (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        Copiar
                    </>
                )}
            </button>
          )}

          <button 
             onClick={() => setIsExpanded(!isExpanded)} 
             className="p-2 rounded-md hover:bg-ds-muted/40 transition-colors"
             aria-label={isExpanded ? "Recolher insights" : "Expandir insights"}
           >
             <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-ds-text transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
             </svg>
           </button>
        </div>
      </div>

      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[1000px] pt-4' : 'max-h-0 pt-0'}`}>
        {loading && !insight && <div className="text-ds-text">Analisando dados e gerando insights...</div>}
        {error && <div className="text-red-400">{error}</div>}
        {insight && <div className="prose prose-invert text-ds-light-text max-w-none">{formatInsight(insight)}</div>}
        {!loading && !insight && !error && <div className="text-ds-text">Clique em "Gerar Insights" para analisar os dados filtrados.</div>}
      </div>
    </div>
  );
};

export default AIInsights;