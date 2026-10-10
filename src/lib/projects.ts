/**
 * `metadataURI` a project is registered with onchain. The server only links an
 * onchain project to a Contribo project when this value and the owner wallet match.
 */
export function projectMetadataUri(projectId: string): string {
  return `contribo:project:${projectId}`;
}

export const PROJECT_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/;
