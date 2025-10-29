const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function getToken() {
  return localStorage.getItem('ft_token') || '';
}
export function setToken(token) {
  if (token) localStorage.setItem('ft_token', token);
  else localStorage.removeItem('ft_token');
}
export function getTreeId() {
  return localStorage.getItem('ft_tree_id') || '';
}
export function setTreeId(id) {
  if (id) localStorage.setItem('ft_tree_id', id);
  else localStorage.removeItem('ft_tree_id');
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const t = token || getToken();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(json?.error || res.statusText);
  return json;
}

export const Auth = {
  async register(email, password) {
    const data = await api('/api/auth/register', { method: 'POST', body: { email, password } });
    setToken(data.token);
    return data;
  },
  async login(email, password) {
    const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    return data;
  },
  logout() { setToken(''); },
};

export const Trees = {
  async create(title) { return api('/api/trees', { method: 'POST', body: { title } }); },
  async list() { return api('/api/trees'); },
  async get(id) { return api(`/api/trees/${id}`); },
};

export const Members = {
  async create(payload) { return api('/api/members', { method: 'POST', body: payload }); },
  async update(id, payload) { 
    console.log('[Members.update] Sending to', `/api/members/${id}`, 'payload:', payload);
    const result = await api(`/api/members/${id}`, { method: 'PUT', body: payload });
    console.log('[Members.update] Response:', result);
    return result;
  },
  async delete(id) { 
    console.log('[Members.delete] Deleting member:', id);
    return api(`/api/members/${id}`, { method: 'DELETE' }); 
  },
};

export const Relationships = {
  async create(payload) { return api('/api/relationships', { method: 'POST', body: payload }); },
  async update(payload) { return api('/api/relationships', { method: 'PUT', body: payload }); },
  async remove(payload) {
    // Some environments (proxies / dev servers) drop DELETE bodies; include params in query string as a fallback.
    const qs = `?fromMemberId=${encodeURIComponent(payload.fromMemberId)}&toMemberId=${encodeURIComponent(payload.toMemberId)}&type=${encodeURIComponent(payload.type)}`;
    return api(`/api/relationships${qs}`, { method: 'DELETE' });
  },
};

export const Users = {
  async me() { return api('/api/users/me'); },
};
