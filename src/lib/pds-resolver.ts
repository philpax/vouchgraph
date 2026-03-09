import { getPdsEndpoint } from "@atcute/identity";
import type { DidDocument } from "@atcute/identity";

const pdsCache = new Map<string, string>();

export async function resolvePds(did: string): Promise<string> {
  const cached = pdsCache.get(did);
  if (cached) return cached;

  let doc: DidDocument;

  if (did.startsWith("did:plc:")) {
    const res = await fetch(`https://plc.directory/${did}`);
    if (!res.ok) throw new Error(`Failed to resolve ${did}`);
    doc = await res.json();
  } else if (did.startsWith("did:web:")) {
    const host = did.slice("did:web:".length).replaceAll(":", "/");
    const res = await fetch(`https://${host}/.well-known/did.json`);
    if (!res.ok) throw new Error(`Failed to resolve ${did}`);
    doc = await res.json();
  } else {
    throw new Error(`Unsupported DID method: ${did}`);
  }

  const pds = getPdsEndpoint(doc);
  if (!pds) throw new Error(`No PDS endpoint for ${did}`);

  pdsCache.set(did, pds);
  return pds;
}
