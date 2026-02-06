import React, { useMemo } from 'react';
import { SyncStatus } from '../hooks/useAzureDevOpsData';
// Fix: Import date-fns functions from their submodules for v2 compatibility.
import { formatDistanceToNow } from 'date-fns'; // Updated to named imports
// Fix: Import locale data with a default import from its specific path to resolve type errors.
import { ptBR } from 'date-fns/locale/pt-BR'; // Updated to named imports
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
    lastSyncStatus: SyncStatus | null;
    onOpenUserManagement?: () => void;
    onSync?: () => void;
    syncing?: boolean;
}

const Header: React.FC<HeaderProps> = ({ lastSyncStatus, onOpenUserManagement, onSync, syncing }) => {
    const { user, logout, isAdmin } = useAuth();
    
    const syncInfo = useMemo(() => {
        if (!lastSyncStatus) {
            return { color: 'gray', text: 'Verificando status...' };
        }
        if (lastSyncStatus.status === 'success') {
            try {
                const syncDate = new Date(lastSyncStatus.syncTime);
                if (isNaN(syncDate.getTime())) {
                    return { color: 'green', text: 'Dados sincronizados' };
                }
                const timeAgo = formatDistanceToNow(syncDate, { addSuffix: true, locale: ptBR });
                return { color: 'green', text: `Dados sincronizados ${timeAgo}` };
            } catch {
                return { color: 'green', text: 'Dados sincronizados' };
            }
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
            
            {/* User Info & Logout */}
            <div className="flex items-center gap-4">
                {/* Sync Button */}
                {onSync && (
                    <button
                        onClick={onSync}
                        disabled={syncing}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-semibold ${
                            syncing
                                ? 'bg-ds-green/20 text-ds-green cursor-not-allowed'
                                : 'bg-ds-green/10 text-ds-green hover:bg-ds-green/20'
                        }`}
                        title="Sincronizar dados do Azure DevOps"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
                    </button>
                )}
                {isAdmin && onOpenUserManagement && (
                    <button
                        onClick={onOpenUserManagement}
                        className="flex items-center gap-2 px-3 py-2 bg-ds-navy hover:bg-ds-border rounded-lg transition-colors text-sm"
                        title="Gerenciar Usuários"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        <span className="hidden sm:inline">Usuários</span>
                    </button>
                )}
                <div className="text-right">
                    <p className="text-sm text-ds-light-text">{user?.username}</p>
                    <p className="text-xs text-ds-text">{isAdmin ? 'Administrador' : 'Usuário'}</p>
                </div>
                <button
                    onClick={logout}
                    className="flex items-center gap-2 px-3 py-2 bg-ds-navy hover:bg-ds-border rounded-lg transition-colors text-sm"
                    title="Sair"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span className="hidden sm:inline">Sair</span>
                </button>
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