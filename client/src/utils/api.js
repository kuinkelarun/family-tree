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
  async delete(id, hard = false) { const q = hard ? '?hard=true' : ''; return api(`/api/trees/${id}${q}`, { method: 'DELETE' }); },
  async updateMarriagePoint(id, payload) { return api(`/api/trees/${id}/marriage-points`, { method: 'PUT', body: payload }); },
  async kinship(id, from, to, depth = 10, locale = 'en', includePronouns = false) {
    const q = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&depth=${encodeURIComponent(depth)}&locale=${encodeURIComponent(locale)}&includePronouns=${includePronouns ? 'true' : 'false'}`;
    return api(`/api/trees/${id}/kinship?${q}`);
  },
  async kinshipMap(id, memberId, depth = 8, locale = 'en', includePronouns = false) {
    const q = `depth=${encodeURIComponent(depth)}&locale=${encodeURIComponent(locale)}&includePronouns=${includePronouns ? 'true' : 'false'}`;
    return api(`/api/trees/${id}/kinship/${encodeURIComponent(memberId)}?${q}`);
  },
};
// Archived/restore helpers for owner
Trees.archived = async function listArchived() { return api('/api/trees/archived'); };
Trees.restore = async function restoreTree(id) { return api(`/api/trees/${encodeURIComponent(id)}/restore`, { method: 'POST' }); };
Trees.requestAdminDelete = async function requestAdminDelete(id) { return api(`/api/trees/${encodeURIComponent(id)}/request-admin-delete`, { method: 'POST' }); };

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
  async validate(payload) { return api('/api/relationships/validate', { method: 'POST', body: payload }); },
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

export const Admin = {
  async listRecomputeJobs({ page, limit, status, treeId } = {}) {
    const qs = [];
    if (page) qs.push(`page=${encodeURIComponent(page)}`);
    if (limit) qs.push(`limit=${encodeURIComponent(limit)}`);
    if (status) qs.push(`status=${encodeURIComponent(status)}`);
    if (treeId) qs.push(`treeId=${encodeURIComponent(treeId)}`);
    const q = qs.length ? `?${qs.join('&')}` : '';
    return api(`/api/admin/recompute-queue${q}`);
  },
  async forceRetryJob(jobId) { return api(`/api/admin/recompute-queue/${encodeURIComponent(jobId)}/retry`, { method: 'POST' }); },
  async removeJob(jobId) { return api(`/api/admin/recompute-queue/${encodeURIComponent(jobId)}`, { method: 'DELETE' }); },
  async getValidationRules() { return api('/api/admin/validation/rules'); },
  async getSeverities(treeId) { return api(`/api/admin/trees/${encodeURIComponent(treeId)}/severities`); },
  async patchSeverities(treeId, updates) { return api(`/api/admin/trees/${encodeURIComponent(treeId)}/severities`, { method: 'PATCH', body: { updates } }); },
  async deleteSeverity(treeId, ruleId) { return api(`/api/admin/trees/${encodeURIComponent(treeId)}/severities/${encodeURIComponent(ruleId)}`, { method: 'DELETE' }); },
  // Global severities (admins only)
  async getGlobalSeverities() { return api('/api/admin/validation/global-severities'); },
  async patchGlobalSeverities(updates) { return api('/api/admin/validation/global-severities', { method: 'PATCH', body: { updates } }); },
  async deleteGlobalSeverity(ruleId) { return api(`/api/admin/validation/global-severities/${encodeURIComponent(ruleId)}`, { method: 'DELETE' }); },
  // Admin trees management
  async listTrees({ limit, offset, sort, dir, search, showDeleted } = {}) {
    const qs = [];
    if (limit) qs.push(`limit=${encodeURIComponent(limit)}`);
    if (offset) qs.push(`offset=${encodeURIComponent(offset)}`);
    if (sort) qs.push(`sort=${encodeURIComponent(sort)}`);
    if (dir) qs.push(`dir=${encodeURIComponent(dir)}`);
    if (search) qs.push(`search=${encodeURIComponent(search)}`);
    if (showDeleted) qs.push(`showDeleted=true`);
    const q = qs.length ? `?${qs.join('&')}` : '';
    return api(`/api/admin/trees${q}`);
  },
  async getTree(id) { return api(`/api/admin/trees/${encodeURIComponent(id)}`); },
  async archiveTree(id, archive = true) { return api(`/api/admin/trees/${encodeURIComponent(id)}/archive`, { method: 'POST', body: { archive } }); },
  async transferTree(id, newOwnerId) { return api(`/api/admin/trees/${encodeURIComponent(id)}/transfer`, { method: 'POST', body: { newOwnerId } }); },
  async deleteTree(id, hard = false) { const q = hard ? '?hard=true' : ''; return api(`/api/admin/trees/${encodeURIComponent(id)}${q}`, { method: 'DELETE' }); },
  async bulkTrees(action, ids = []) { return api('/api/admin/trees/bulk', { method: 'POST', body: { action, ids } }); },
};
