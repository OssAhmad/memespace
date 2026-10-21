export const ID = /^[a-z][a-z0-9-]{2,79}$/;
export const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const EDGE_TYPES = {
  owns: { label: 'owner', directed: true },
  in_love: { label: 'in love', directed: false },
  references: { label: 'references', directed: true }
};
export function validateCatalog(catalog) {
  if (catalog.version !== 1 || !Array.isArray(catalog.nodes) || !Array.isArray(catalog.edges)) throw new Error('Invalid catalog format.');
  const ids = new Set(), slugs = new Set();
  const reserved = new Set(['api', 'assets', 'files', 'm', 'minds', 'account', 'admin', '404']);
  for (const node of catalog.nodes) {
    if (!ID.test(node.id) || ids.has(node.id)) throw new Error(`Invalid or duplicate node ID: ${node.id}`);
    if (!SLUG.test(node.slug) || slugs.has(node.slug) || reserved.has(node.slug)) throw new Error(`Invalid or reserved slug: ${node.slug}`);
    if (!['meme', 'mind'].includes(node.kind) || typeof node.title !== 'string' || !node.title.trim() || node.title.length > 160) throw new Error(`Invalid node: ${node.id}`);
    if (node.visibility && !['public','private'].includes(node.visibility)) throw new Error(`Invalid visibility: ${node.id}`);
    if(node.kind==='mind'&&node.visibility==='private')throw new Error('Registered and seed Mind profiles are public in this release.');
    if (node.repository && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(node.repository)) throw new Error(`Use a canonical GitHub repository URL for ${node.id}`);
    if (node.publication && !/^[a-f0-9]{40}$/.test(node.publication.commit)) throw new Error(`A publication needs a full Git commit: ${node.id}`);
    ids.add(node.id); slugs.add(node.slug);
  }
  const edgeIds = new Set();
  for (const edge of catalog.edges) {
    if (!ID.test(edge.id) || edgeIds.has(edge.id) || !ids.has(edge.source) || !ids.has(edge.target) || !EDGE_TYPES[edge.type]) throw new Error(`Invalid edge: ${edge.id}`);
    edgeIds.add(edge.id);
  }
  return catalog;
}
export const nodePath = node => node.kind === 'mind' ? `/minds/${node.slug}` : `/${node.slug}`;
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
