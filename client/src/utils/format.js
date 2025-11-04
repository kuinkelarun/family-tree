// Utilities for consistent member display across the app

export function displayMemberName(member) {
  if (!member) return 'Unnamed';
  const name = (member.name || '').trim() || 'Unnamed';
  const nick = (member.nickname || '').trim();
  return nick ? `${name} (${nick})` : name;
}
