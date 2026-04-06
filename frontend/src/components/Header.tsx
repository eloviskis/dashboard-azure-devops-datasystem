import React, { useMemo, useState, useRef, useEffect } from 'react';
import { SyncStatus } from '../hooks/useAzureDevOpsData';
import { WorkItem } from '../types';
// Fix: Import date-fns functions from their submodules for v2 compatibility.
import { formatDistanceToNow } from 'date-fns'; // Updated to named imports
// Fix: Import locale data with a default import from its specific path to resolve type errors.
import { ptBR } from 'date-fns/locale/pt-BR'; // Updated to named imports
import { useAuth } from '../contexts/AuthContext';
import ChangePasswordModal from './ChangePasswordModal';

interface HeaderProps {
    lastSyncStatus: SyncStatus | null;
    onOpenUserManagement?: () => void;
    onSync?: () => void;
    syncing?: boolean;
    workItems?: WorkItem[];
}

const Header: React.FC<HeaderProps> = ({ lastSyncStatus, onOpenUserManagement, onSync, syncing, workItems = [] }) => {
    const { user, logout, isAdmin } = useAuth();
    const [showAlerts, setShowAlerts] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);

    // Fecha o menu ao clicar fora
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
                setShowUserMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    // Alert badge: high priority items aging in WIP
    const alerts = useMemo(() => {
        const IN_PROGRESS = ['Active', 'Ativo', 'Em Progresso', 'Para Desenvolver', 'Aguardando Code Review', 'Fazendo Code Review', 'Aguardando QA', 'Testando QA'];
        const now = Date.now();
        const critical: { id: number; title: string; age: number; priority: number; team: string }[] = [];
        workItems.forEach(item => {
            if (!IN_PROGRESS.includes(item.state)) return;
            const ref = new Date(item.changedDate || item.createdDate || '');
            if (isNaN(ref.getTime())) return;
            const age = Math.round((now - ref.getTime()) / (1000 * 60 * 60 * 24));
            const priority = Number(item.priority) || 4;
            const threshold = priority === 1 ? 3 : priority === 2 ? 7 : 14;
            if (age > threshold) {
                critical.push({ id: item.workItemId, title: item.title, age, priority, team: item.team || '' });
            }
        });
        return critical.sort((a, b) => a.priority - b.priority || b.age - a.age).slice(0, 15);
    }, [workItems]);
    
    const syncInfo = useMemo(() => {
        if (!lastSyncStatus) {
            return { colorClass: 'bg-gray-500', text: 'Verificando status...', dateText: '' };
        }
        
        // Suporta tanto syncTime (camelCase) quanto sync_time (snake_case)
        const syncTimeStr = lastSyncStatus.syncTime || lastSyncStatus.sync_time;
        const syncDate = syncTimeStr ? new Date(syncTimeStr) : new Date();
        const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
        const timeSinceSync = Date.now() - syncDate.getTime();
        const isWithinInterval = !isNaN(syncDate.getTime()) && timeSinceSync < SYNC_INTERVAL_MS;
        const isStale = !isNaN(syncDate.getTime()) && timeSinceSync >= SYNC_INTERVAL_MS;
        
        const formatSyncDate = (d: Date) => {
            if (isNaN(d.getTime())) return '';
            return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        };
        const dateText = formatSyncDate(syncDate);
        
        if (lastSyncStatus.status === 'success') {
            try {
                if (isNaN(syncDate.getTime())) {
                    return { colorClass: 'bg-green-500', text: 'Dados sincronizados', dateText: '' };
                }
                const timeAgo = formatDistanceToNow(syncDate, { addSuffix: true, locale: ptBR });
                const itemsText = lastSyncStatus.work_items ? ` (${lastSyncStatus.work_items.toLocaleString()} itens)` : '';
                if (isStale) {
                    return { colorClass: 'bg-red-500', text: `Sync automático atrasado — última ${timeAgo}${itemsText}`, dateText };
                }
                return { colorClass: 'bg-green-500', text: `Sincronizado ${timeAgo}${itemsText}`, dateText };
            } catch {
                return { colorClass: isStale ? 'bg-red-500' : 'bg-green-500', text: 'Dados sincronizados', dateText };
            }
        }
        
        if (lastSyncStatus.status === 'warning') {
            try {
                const timeAgo = formatDistanceToNow(syncDate, { addSuffix: true, locale: ptBR });
                const message = lastSyncStatus.message || `Última atualização ${timeAgo}`;
                return { colorClass: isStale ? 'bg-red-500' : 'bg-yellow-500', text: message, dateText };
            } catch {
                return { colorClass: 'bg-yellow-500', text: lastSyncStatus.message || 'Dados levemente desatualizados', dateText };
            }
        }
        
        if (lastSyncStatus.status === 'error') {
            if (isWithinInterval) {
                try {
                    const timeAgo = formatDistanceToNow(syncDate, { addSuffix: true, locale: ptBR });
                    return { colorClass: 'bg-yellow-500', text: `Última sync ${timeAgo} (timeout parcial)`, dateText };
                } catch {
                    return { colorClass: 'bg-yellow-500', text: 'Sync recente (possível timeout)', dateText };
                }
            }
            return { colorClass: 'bg-red-500', text: 'Falha na última sincronização', dateText };
        }
        return { colorClass: 'bg-yellow-500', text: 'Sincronização pendente', dateText: '' };
    }, [lastSyncStatus]);

    return (
        <header className="bg-ds-dark-blue text-ds-light-text p-5 px-10 border-b border-ds-border flex items-center justify-between">
            <div className="flex items-center gap-4">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="#7FD320" strokeWidth="2" strokeLinejoin="round"/>
                    <path d="M2 7L12 12M22 7L12 12M12 22V12" stroke="#7FD320" strokeWidth="2" strokeLinejoin="round"/>
                    <path d="M17 4.5L7 9.5" stroke="#7FD320" strokeOpacity="0.7" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                <div className="font-sans">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold tracking-wider">
                            <span className="text-white">DATA</span>
                            <span className="text-ds-green">SYSTEM</span>
                        </h1>
                        <div className="has-tooltip">
                           <span className={`h-3 w-3 rounded-full ${syncInfo.colorClass} block`}></span>
                           <span className='tooltip rounded shadow-lg p-2 bg-ds-navy text-ds-light-text -mt-14 ml-4 text-xs whitespace-nowrap'>
                             {syncInfo.dateText ? `Última Sincronização: ${syncInfo.dateText}` : syncInfo.text}
                             {syncInfo.dateText && <br />}
                             {syncInfo.dateText && <span className="text-ds-text">{syncInfo.text}</span>}
                           </span>
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
                {/* Alert Badge */}
                {alerts.length > 0 && (
                    <div className="relative">
                        <button
                            onClick={() => setShowAlerts(!showAlerts)}
                            className="relative flex items-center gap-1 px-3 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors text-sm"
                            title={`${alerts.length} alertas de itens críticos`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                                {alerts.length}
                            </span>
                        </button>
                        {showAlerts && (
                            <div className="absolute right-0 top-12 w-96 max-h-80 overflow-y-auto bg-ds-navy border border-ds-border rounded-lg shadow-xl z-50 p-3">
                                <h4 className="text-ds-light-text font-semibold text-sm mb-2">🚨 Itens Críticos ({alerts.length})</h4>
                                <div className="space-y-1">
                                    {alerts.map((a, i) => (
                                        <a key={i} href={`https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit/${a.id}`} target="_blank" rel="noopener noreferrer"
                                           className="block p-2 hover:bg-ds-muted/20 rounded text-xs">
                                            <div className="flex items-center gap-2">
                                                <span className={`font-bold ${a.priority === 1 ? 'text-red-400' : a.priority === 2 ? 'text-yellow-400' : 'text-blue-400'}`}>P{a.priority}</span>
                                                <span className="text-ds-light-text truncate flex-1">#{a.id} {a.title}</span>
                                                <span className="text-red-400 font-semibold">{a.age}d</span>
                                            </div>
                                            <span className="text-ds-text">{a.team}</span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
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
                {/* User menu dropdown */}
                <div className="relative" ref={userMenuRef}>
                    <button
                        onClick={() => setShowUserMenu(v => !v)}
                        className="flex items-center gap-2 px-3 py-2 bg-ds-navy hover:bg-ds-border rounded-lg transition-colors text-sm"
                        title="Menu do usuário"
                    >
                        <div className="text-right">
                            <p className="text-sm text-ds-light-text leading-tight">{user?.username}</p>
                            <p className="text-xs text-ds-text">{isAdmin ? 'Administrador' : 'Usuário'}</p>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-ds-text transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {showUserMenu && (
                        <div className="absolute right-0 top-12 w-48 bg-ds-navy border border-ds-border rounded-lg shadow-xl z-50 overflow-hidden">
                            <button
                                onClick={() => { setShowChangePassword(true); setShowUserMenu(false); }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-ds-light-text hover:bg-ds-border transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-ds-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                Alterar Senha
                            </button>
                            <div className="border-t border-ds-border" />
                            <button
                                onClick={() => { logout(); setShowUserMenu(false); }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-ds-border transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                Sair
                            </button>
                        </div>
                    )}
                </div>

                {showChangePassword && (
                    <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
                )}
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