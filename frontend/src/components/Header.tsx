import React, { useMemo } from 'react';
import { SyncStatus } from '../hooks/useAzureDevOpsData';
// Fix: Import date-fns functions from their submodules for v2 compatibility.
import formatDistanceToNow from 'date-fns/formatDistanceToNow';
// Fix: Import locale data with a default import from its specific path to resolve type errors.
import ptBR from 'date-fns/locale/pt-BR';

interface HeaderProps {
    lastSyncStatus: SyncStatus | null;
}

const Header: React.FC<HeaderProps> = ({ lastSyncStatus }) => {
    
    const syncInfo = useMemo(() => {
        if (!lastSyncStatus) {
            return { color: 'gray', text: 'Verificando status...' };
        }
        if (lastSyncStatus.status === 'success') {
            const timeAgo = formatDistanceToNow(new Date(lastSyncStatus.syncTime), { addSuffix: true, locale: ptBR });
            return { color: 'green', text: `Dados sincronizados ${timeAgo}` };
        }
        if (lastSyncStatus.status === 'error') {
            return { color: 'red', text: 'Falha na última sincronização' };
        }
        return { color: 'yellow', text: 'Sincronização pendente' };
    }, [lastSyncStatus]);

    return (
        <header className="bg-ds-dark-blue text-ds-light-text p-5 px-10 border-b border-ds-border flex items-center justify-between">
            <div className="flex items-center gap-4">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="#64FFDA" strokeWidth="2" strokeLinejoin="round"/>
                    <path d="M2 7L12 12M22 7L12 12M12 22V12" stroke="#64FFDA" strokeWidth="2" strokeLinejoin="round"/>
                    <path d="M17 4.5L7 9.5" stroke="#64FFDA" strokeOpacity="0.7" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                <div className="font-sans">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold tracking-wider">
                            <span className="text-white">DATA</span>
                            <span className="text-ds-green">SYSTEM</span>
                        </h1>
                        <div className="has-tooltip">
                           <span className={`h-3 w-3 rounded-full bg-${syncInfo.color}-500 block`}></span>
                           <span className='tooltip rounded shadow-lg p-2 bg-ds-navy text-ds-light-text -mt-12 ml-4 text-xs whitespace-nowrap'>{syncInfo.text}</span>
                        </div>
                    </div>
                    <p className="text-sm text-ds-text tracking-widest">DevOps Performance Dashboard</p>
                </div>
            </div>
            {/* Fix: Replace unsupported `style jsx` with a standard `style` tag for compatibility. */}
            <style>{`
                .has-tooltip:hover .tooltip {
                    display: block;
                }
                .tooltip {
                    display: none;
                    position: absolute;
                    z-index: 50;
                }
                .bg-green-500 { background-color: #48bb78; }
                .bg-red-500 { background-color: #f56565; }
                .bg-yellow-500 { background-color: #f6e05e; }
                .bg-gray-500 { background-color: #a0aec0; }
            `}</style>
        </header>
    );
};

export default Header;
