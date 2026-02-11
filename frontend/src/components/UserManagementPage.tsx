import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
  updatedAt?: string;
}

const UserManagementPage: React.FC = () => {
  const { token } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({ 
    username: '', 
    email: '', 
    password: '', 
    role: 'user' as 'admin' | 'user'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || 'https://backend-hazel-three-14.vercel.app';

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/users`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        setError('Erro ao carregar usuários');
      }
    } catch (err) {
      setError('Erro de conexão ao carregar usuários');
    } finally {
      setIsLoading(false);
    }
  }, [token, API_URL]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Usuário criado com sucesso!');
        setShowCreateForm(false);
        setFormData({ username: '', email: '', password: '', role: 'user' });
        fetchUsers();
      } else {
        setError(data.error || 'Erro ao criar usuário');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const updateData: Record<string, unknown> = { 
        role: formData.role
      };
      if (formData.password) {
        updateData.password = formData.password;
      }

      const response = await fetch(`${API_URL}/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updateData)
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Usuário atualizado com sucesso!');
        setEditingUser(null);
        setFormData({ username: '', email: '', password: '', role: 'user' });
        fetchUsers();
      } else {
        setError(data.error || 'Erro ao atualizar usuário');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Tem certeza que deseja excluir o usuário "${user.username}"?`)) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_URL}/api/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Usuário excluído com sucesso!');
        fetchUsers();
      } else {
        setError(data.error || 'Erro ao excluir usuário');
      }
    } catch (err) {
      setError('Erro de conexão');
    }
  };

  const startEdit = (user: User) => {
    setEditingUser(user);
    setFormData({ 
      username: user.username, 
      email: user.email, 
      password: '', 
      role: user.role
    });
    setShowCreateForm(false);
  };

  const cancelForm = () => {
    setShowCreateForm(false);
    setEditingUser(null);
    setFormData({ username: '', email: '', password: '', role: 'user' });
    setError('');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-ds-green"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ds-light-text">Gerenciamento de Usuários</h1>
        {!showCreateForm && !editingUser && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-ds-green hover:bg-ds-green/90 text-ds-dark-blue font-semibold rounded-lg transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Novo Usuário
          </button>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Create/Edit Form */}
      {(showCreateForm || editingUser) && (
        <div className="bg-ds-navy rounded-lg p-6 mb-6 border border-ds-border">
          <h2 className="text-lg font-semibold text-ds-light-text mb-4">
            {editingUser ? `Editar Usuário: ${editingUser.username}` : 'Criar Novo Usuário'}
          </h2>
          <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser} className="space-y-4">
            {!editingUser && (
              <>
              <div>
                <label className="block text-sm font-medium text-ds-text mb-2">Usuário</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-2 bg-ds-dark-blue border border-ds-border rounded-lg text-ds-light-text focus:outline-none focus:ring-2 focus:ring-ds-green"
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ds-text mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-ds-dark-blue border border-ds-border rounded-lg text-ds-light-text focus:outline-none focus:ring-2 focus:ring-ds-green"
                  required
                  disabled={isSubmitting}
                />
              </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-ds-text mb-2">
                {editingUser ? 'Nova Senha (deixe em branco para manter)' : 'Senha'}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-2 bg-ds-dark-blue border border-ds-border rounded-lg text-ds-light-text focus:outline-none focus:ring-2 focus:ring-ds-green"
                required={!editingUser}
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ds-text mb-2">Função</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
                className="w-full px-4 py-2 bg-ds-dark-blue border border-ds-border rounded-lg text-ds-light-text focus:outline-none focus:ring-2 focus:ring-ds-green"
                disabled={isSubmitting}
              >
                <option value="user">Usuário</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-ds-green hover:bg-ds-green/90 disabled:bg-ds-green/50 text-ds-dark-blue font-semibold rounded-lg transition-all"
              >
                {isSubmitting ? 'Salvando...' : (editingUser ? 'Salvar' : 'Criar')}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                disabled={isSubmitting}
                className="px-4 py-2 bg-ds-border hover:bg-ds-border/80 text-ds-light-text font-semibold rounded-lg transition-all"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-ds-navy rounded-lg border border-ds-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-ds-dark-blue">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-ds-text">Usuário</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-ds-text">Função</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-ds-text">Criado em</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-ds-text">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ds-border">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-ds-dark-blue/50 transition-colors">
                <td className="px-4 py-3 text-ds-light-text">{user.username}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    user.role === 'admin' 
                      ? 'bg-purple-500/20 text-purple-400' 
                      : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {user.role === 'admin' ? 'Administrador' : 'Usuário'}
                  </span>
                </td>
                <td className="px-4 py-3 text-ds-text text-sm">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString('pt-BR') : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => startEdit(user)}
                      className="p-2 text-ds-text hover:text-ds-green transition-colors"
                      title="Editar"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user)}
                      className="p-2 text-ds-text hover:text-red-400 transition-colors"
                      title="Excluir"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ds-text">
                  Nenhum usuário encontrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserManagementPage;
