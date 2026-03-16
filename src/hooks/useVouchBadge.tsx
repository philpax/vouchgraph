import type { Auth } from "./useAuth";

const PILL = "text-[10px] px-1.5 py-0.5 rounded-full shrink-0 leading-none";

export function useVouchBadge(
  auth: Auth,
  profileDid: string,
  vouchDetails: Map<string, { inbound: string[]; outbound: string[] }>,
  nodeIdToIndex: Map<string, number>,
) {
  const onGraph = nodeIdToIndex.has(profileDid);

  if (!onGraph)
    return (
      <span className={`${PILL} bg-white/10 text-white/40`}>not in graph</span>
    );

  if (!auth.did || auth.did === profileDid) return null;

  const myVouches = vouchDetails.get(auth.did);
  const iVouchThem = myVouches?.outbound.includes(profileDid) ?? false;
  const theyVouchMe = myVouches?.inbound.includes(profileDid) ?? false;

  if (iVouchThem && theyVouchMe)
    return (
      <span className={`${PILL} bg-emerald-500/20 text-emerald-400`}>
        mutual
      </span>
    );
  if (iVouchThem)
    return (
      <span className={`${PILL} bg-blue-500/20 text-blue-400`}>vouched</span>
    );
  if (theyVouchMe)
    return (
      <span className={`${PILL} bg-orange-500/20 text-orange-400`}>
        vouches you
      </span>
    );
  return null;
}
